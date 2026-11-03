import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createDepartmentLookup, DepartmentLookupError, type DepartmentResult } from '../_shared/discordDepartments.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'Retry-After' };
const json = (status: number, value: unknown, retry?: number) => Response.json(value, {
  status, headers: { ...cors, 'Cache-Control': 'no-store', ...(retry ? { 'Retry-After': String(retry) } : {}) },
});
const lookup = createDepartmentLookup();

async function emptyObjectBody(req: Request) {
  if (!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json') || Number(req.headers.get('Content-Length')) > 256 || !req.body) return false;
  const reader = req.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = ''; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 256) { await reader.cancel(); return false; }
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    return body !== null && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0;
  } catch { return false; }
  finally { reader.releaseLock(); }
}

async function handleDepartmentSync(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json(503, { error: 'Не удалось проверить отдел. Попробуйте позже.' });
  const client = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false, autoRefreshToken: false } });
  let user;
  try {
    const { data, error } = await client.auth.getUser();
    if (error && (error.name === 'AuthRetryableFetchError' || error.status === 429 || (error.status ?? 0) >= 500)) return json(503, { error: 'Не удалось проверить вход. Попробуйте позже.' });
    if (error || !data.user) return json(401, { error: 'Войдите через Discord.' });
    user = data.user;
  } catch { return json(503, { error: 'Не удалось проверить вход. Попробуйте позже.' }); }
  const discordId = user.identities?.find(identity => identity.provider === 'discord')?.identity_data?.sub;
  if (typeof discordId !== 'string' || !/^\d{17,20}$/.test(discordId)) return json(403, { error: 'Подтвердите вход через Discord.' });
  // The caller cannot choose a Discord account, guild, role, or department.
  if (!await emptyObjectBody(req)) return json(400, { error: 'Некорректный запрос проверки отдела.' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: claim, error: claimError } = await admin.rpc('reserve_discord_department_sync', { p_user_id: user.id });
  if (claimError || !claim) return json(503, { error: 'Проверка отдела временно недоступна.' });
  if (claim.kind === 'cached') return json(200, claim.result);
  if (claim.kind === 'limited' || claim.kind === 'busy') {
    const retry = Number.isInteger(claim.retryAfterSeconds) ? Math.max(1, Math.min(300, claim.retryAfterSeconds)) : 30;
    return json(429, { error: 'Проверка уже выполняется. Повторите чуть позже.' }, retry);
  }
  if (claim.kind !== 'claimed' || typeof claim.ticket !== 'string') return json(503, { error: 'Проверка отдела временно недоступна.' });
  let result: DepartmentResult; let retryAfter = 0;
  try {
    const token = Deno.env.get('DISCORD_BOT_TOKEN');
    if (!token) throw new DepartmentLookupError();
    result = await lookup.lookup(discordId, token, Deno.env.get('DISCORD_CHANNEL_ID'), Deno.env.get('DISCORD_GUILD_ID'));
  } catch (error) {
    console.error('Discord department lookup unavailable');
    retryAfter = error instanceof DepartmentLookupError ? error.retryAfter : 0;
    result = { department: '', status: 'unavailable' };
  }
  const { data: saved, error: saveError } = await admin.rpc('complete_discord_department_sync', {
    p_user_id: user.id, p_ticket: claim.ticket, p_department: result.department, p_status: result.status, p_retry_after: retryAfter,
  });
  if (saveError || !saved) return json(503, { error: 'Не удалось сохранить проверку отдела. Попробуйте позже.' });
  return json(200, saved);
}

Deno.serve(async req => {
  try { return await handleDepartmentSync(req); }
  catch { console.error('Department sync unavailable'); return json(503, { error: 'Не удалось проверить отдел. Попробуйте позже.' }); }
});
