import { createClient } from 'jsr:@supabase/supabase-js@2';

type Handler = (req: Request) => Response | Promise<Response>;
const COOLDOWN_SECONDS = 60;

export function withSubmissionCooldown(handler: Handler, cors: Record<string, string>): Handler {
  return async (req) => {
    if (req.method !== 'POST') return handler(req);

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
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return handler(req);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const requestId = crypto.randomUUID();
    const { data, error } = await admin.rpc('claim_application_submission', {
      p_user_id: user.id, p_request_id: requestId,
    });
    if (error || typeof data !== 'number' || !Number.isInteger(data) || data < 0 || data > COOLDOWN_SECONDS) {
      console.error('Application cooldown claim failed', error);
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
      const { error: releaseError } = await admin.rpc('release_application_submission', {
        p_user_id: user.id, p_request_id: requestId,
      });
      if (releaseError) console.error('Application cooldown release failed', releaseError);
    };
    try {
      const response = await handler(req);
      if (!response.ok) await release();
      return response;
    } catch (sendError) {
      await release();
      throw sendError;
    }
  };
}
