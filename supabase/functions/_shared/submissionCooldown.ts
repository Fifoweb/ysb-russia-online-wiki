import { createClient } from 'jsr:@supabase/supabase-js@2';

type Handler = (req: Request) => Response | Promise<Response>;
const COOLDOWN_SECONDS = 150;
const MAX_BODY_BYTES = 16_384;

async function readBody(req: Request): Promise<{ text?: string; status?: number }> {
  if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return { status: 415 };
  if (Number(req.headers.get('Content-Length')) > MAX_BODY_BYTES) return { status: 413 };
  if (!req.body) return { status: 400 };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); return { status: 413 }; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const body: unknown = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) ? { text } : { status: 400 };
  } catch { return { status: 400 }; }
  finally { reader.releaseLock(); }
}

export function withSubmissionCooldown(handler: Handler, cors: Record<string, string>): Handler {
  return async (req) => {
    if (req.method !== 'POST') return handler(req);
    const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, 'Content-Type': 'application/json' } });

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) {
      console.error('Application cooldown is not configured');
      return new Response(JSON.stringify({ error: 'Отправка заявок временно недоступна' }), {
        status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let user;
    try {
      const { data, error } = await userClient.auth.getUser();
      if (error || !data.user) return json(401, { error: 'Для отправки войдите через Discord' });
      user = data.user;
    } catch {
      console.error('Application authentication unavailable');
      return json(503, { error: 'Не удалось проверить вход. Попробуйте позже.' });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      // Failed validation and blocked submissions count too. Never release this limit.
      const { data: retry, error: attemptError } = await admin.rpc('claim_application_attempt', { p_user_id: user.id });
      if (attemptError || typeof retry !== 'number' || !Number.isInteger(retry) || retry < 0 || retry > 60) {
        console.error('Application attempt limit unavailable');
        return json(503, { error: 'Не удалось проверить ограничение попыток. Попробуйте позже.' });
      }
      if (retry > 0) return json(429, {
        error: `Слишком много попыток. Повторите через ${retry} сек.`, retryAfterSeconds: retry,
      }, { 'Retry-After': String(retry), 'Access-Control-Expose-Headers': 'Retry-After' });
      const { data: active, error: sessionError } = await userClient.rpc('is_site_session_active');
      if (sessionError || typeof active !== 'boolean') {
        console.error('Application session check unavailable');
        return json(503, { error: 'Не удалось проверить сессию. Попробуйте позже.' });
      }
      if (!active) return json(401, { error: 'Срок сессии истёк. Войдите через Discord ещё раз.', code: 'SESSION_EXPIRED' });
    } catch {
      console.error('Application request guard unavailable');
      return json(503, { error: 'Отправка временно недоступна. Попробуйте позже.' });
    }

    const body = await readBody(req);
    if (body.status || body.text === undefined) return json(body.status ?? 400, {
      error: body.status === 413 ? 'Данные формы слишком большие' : 'Некорректные данные формы',
    });
    req = new Request(req.url, { method: req.method, headers: req.headers, body: body.text, signal: req.signal });
    const requestId = crypto.randomUUID();
    let data: unknown;
    let error: unknown;
    try {
      ({ data, error } = await admin.rpc('claim_application_submission', { p_user_id: user.id, p_request_id: requestId }));
    } catch { error = true; }
    if (error || typeof data !== 'number' || !Number.isInteger(data) || data < 0 || data > COOLDOWN_SECONDS) {
      console.error('Application cooldown claim failed');
      return new Response(JSON.stringify({ error: 'Не удалось проверить время до следующей заявки. Попробуйте позже.' }), {
        status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (data > 0) {
      return new Response(JSON.stringify({
        error: `Следующую заявку можно отправить через ${data} сек.`, retryAfterSeconds: data,
      }), {
        status: 429,
        headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': String(data),
          'Access-Control-Expose-Headers': 'Retry-After' },
      });
    }

    const release = async () => {
      try {
        const { error: releaseError } = await admin.rpc('release_application_submission', {
          p_user_id: user.id, p_request_id: requestId,
        });
        if (releaseError) console.error('Application cooldown release failed');
      } catch { console.error('Application cooldown release failed'); }
    };
    try {
      const response = await handler(req);
      if (!response.ok) await release();
      return response;
    } catch {
      await release();
      // Fetch errors can contain a secret webhook URL; never log or return them.
      console.error('Application delivery failed');
      return json(502, { error: 'Не удалось отправить заявку. Попробуйте позже.' });
    }
  };
}
