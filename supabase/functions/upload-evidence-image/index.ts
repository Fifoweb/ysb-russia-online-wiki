import { createClient } from 'jsr:@supabase/supabase-js@2';
import { MAX_IMAGE_BYTES, inspectEvidenceImage, readLimitedBytes, allwebsImageUrl, allwebsExpiration } from '../_shared/evidenceImages.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After',
};
const json = (status: number, body: unknown, retry?: number) => Response.json(body, {
  status, headers: { ...cors, ...(retry ? { 'Retry-After': String(retry) } : {}) },
});

async function handleUpload(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), uploadKey = Deno.env.get('ALLWEBS_API_KEY');
  if (!url || !anonKey || !serviceKey || !uploadKey) return json(503, { error: 'Загрузка скриншотов временно недоступна. Можно вставить готовые ссылки.' });
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  let user;
  try {
    const { data, error } = await userClient.auth.getUser();
    if (error && (error.name === 'AuthRetryableFetchError' || error.status === 429 || (error.status ?? 0) >= 500)) return json(503, { error: 'Не удалось проверить вход. Попробуйте позже.' });
    if (error || !data.user) return json(401, { error: 'Для загрузки скриншотов войдите через Discord.' });
    user = data.user;
  } catch { return json(503, { error: 'Не удалось проверить вход. Попробуйте позже.' }); }
  const discordId = user.identities?.find(identity => identity.provider === 'discord')?.identity_data?.sub;
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) return json(403, { error: 'Подтвердите вход через Discord.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data, error } = await admin.rpc('claim_evidence_upload_attempt', { p_user_id: user.id });
    if (error || !Number.isInteger(data) || data < 0 || data > 60) throw new Error();
    if (data > 0) return json(429, { error: `Слишком много загрузок. Повторите через ${data} сек.` }, data);
  } catch { return json(503, { error: 'Не удалось проверить лимит загрузок. Попробуйте позже.' }); }
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/octet-stream'].includes((req.headers.get('Content-Type') ?? '').split(';')[0].toLowerCase())) return json(415, { error: 'Выберите изображение PNG, JPG или WEBP.' });
  if (Number(req.headers.get('Content-Length')) > MAX_IMAGE_BYTES) return json(413, { error: 'Скриншот должен быть не больше 10 МБ.' });
  let bytes: Uint8Array;
  try { bytes = await readLimitedBytes(req.body, MAX_IMAGE_BYTES); }
  catch { return json(413, { error: 'Не удалось прочитать файл. Максимальный размер — 10 МБ.' }); }
  const image = inspectEvidenceImage(bytes);
  if (!image) return json(400, { error: 'Не удалось прочитать изображение. Нужен PNG, JPG или WEBP до 40 мегапикселей.' });
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  let reservation: { result: string; ticket?: string; url?: string; expiresAt?: string };
  try {
    const { data, error } = await admin.rpc('reserve_evidence_upload', { p_user_id: user.id, p_hash: hash, p_size: bytes.length, p_mime: image.mime });
    if (error || !data?.result) throw new Error();
    reservation = data;
  } catch { return json(503, { error: 'Не удалось подготовить загрузку. Попробуйте позже.' }); }
  if (reservation.result === 'ready' && allwebsImageUrl(reservation.url)) return json(200, { url: reservation.url, expiresAt: reservation.expiresAt ?? null, reused: true });
  if (reservation.result === 'limit') return json(429, { error: 'Достигнут суточный лимит загрузки изображений. Можно вставить готовые ссылки.', retryable: false });
  if (reservation.result === 'pending') return json(409, { error: 'Этот скриншот уже загружается. Подождите несколько секунд и повторите попытку.' }, 5);
  if (reservation.result === 'uncertain') return json(409, { error: 'Allwebs не подтвердил предыдущую загрузку этого файла. Повтор заблокирован; можно вставить готовую ссылку вручную.', retryable: false });
  if (reservation.result !== 'reserved' || !reservation.ticket) return json(503, { error: 'Загрузка пока недоступна. Попробуйте позже.' });
  const settle = async (status: 'ready' | 'failed' | 'uncertain', imageUrl: string | null = null, expiresAt: string | null = null) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await admin.rpc('settle_evidence_upload', { p_hash: hash, p_ticket: reservation.ticket, p_status: status, p_url: imageUrl, p_expires_at: expiresAt });
        if (!error && data === true) return true;
      } catch { /* Retry only the database write, never the hosting upload. */ }
    }
    console.error('Evidence upload settlement unavailable');
    return false;
  };
  let response: Response;
  try {
    const form = new FormData();
    form.append('source', new Blob([bytes], { type: image.mime }), `screenshot-${hash.slice(0,16)}.${image.extension}`);
    form.append('format', 'json');
    response = await fetch('https://allwebs.ru/api/1/upload', {
      method: 'POST', headers: { 'X-API-Key': uploadKey }, body: form, signal: AbortSignal.timeout(45_000), redirect: 'error',
    });
  } catch {
    await settle('uncertain');
    return json(502, { error: 'Allwebs не подтвердил загрузку. Файл мог быть принят; повтор заблокирован. Можно вставить ссылку вручную.', retryable: false });
  }
  if (!response.ok) {
    await response.body?.cancel();
    const uncertain = response.status >= 500;
    await settle(uncertain ? 'uncertain' : 'failed');
    console.error('Evidence hosting rejected upload', { status: response.status });
    return json(502, { error: response.status === 429 ? 'Allwebs ограничил загрузки. Попробуйте позже.' : 'Allwebs отклонил файл. Возможно, такой скриншот уже загружался; попробуйте вставить его существующую ссылку.', retryable: !uncertain });
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(await readLimitedBytes(response.body, 256 * 1024)));
    const imageUrl = allwebsImageUrl(body?.image?.url);
    if (body?.status_code !== 200 || !imageUrl) throw new Error();
    const expiresAt = allwebsExpiration(body.image.expiration_date_gmt);
    const synced = await settle('ready', imageUrl, expiresAt);
    return json(200, { url: imageUrl, expiresAt, reused: false, syncPending: !synced });
  } catch {
    await settle('uncertain');
    return json(502, { error: 'Allwebs вернул неподтверждённый результат. Повтор заблокирован; можно вставить ссылку вручную.', retryable: false });
  }
}

// Large binary bodies and multipart encoding share the worker's memory budget.
let inFlight = 0;
Deno.serve(async req => {
  if (req.method !== 'POST') return handleUpload(req);
  if (inFlight >= 2) return json(429, { error: 'Загрузчик занят. Повторите через несколько секунд.' }, 5);
  inFlight++;
  try { return await handleUpload(req); }
  finally { inFlight--; }
});
