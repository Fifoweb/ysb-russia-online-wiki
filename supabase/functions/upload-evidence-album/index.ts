import { createClient } from 'jsr:@supabase/supabase-js@2';
import { MAX_ALBUM_BYTES, MAX_ALBUM_BODY_BYTES, MAX_IMAGE_BYTES, MAX_SELECTED_IMAGES, evidenceHostingUrl, fotoraAlbumUrl, inspectEvidenceImage, readLimitedBytes } from '../_shared/evidenceImages.ts';
import { FotoraUploadError, uploadFotoraAlbum } from '../_shared/fotora.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'Retry-After' };
const json = (status: number, body: unknown, retry?: number) => Response.json(body, { status, headers: { ...cors, ...(retry ? { 'Retry-After': String(retry) } : {}) } });
type Photo = { bytes: Uint8Array; hash: string; mime: string; extension: string; ticket?: string };

async function handleAlbum(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json(503, { error: 'Загрузка временно недоступна. Можно вставить готовые ссылки.' });
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false, autoRefreshToken: false } });
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
  } catch { return json(503, { error: 'Не удалось проверить лимит загрузок.' }); }
  const contentType = req.headers.get('Content-Type') ?? '';
  if (!/^multipart\/form-data;.*boundary=/i.test(contentType)) return json(415, { error: 'Выберите изображения для альбома.' });
  if (Number(req.headers.get('Content-Length')) > MAX_ALBUM_BODY_BYTES) return json(413, { error: 'Слишком большая группа изображений.' });
  let form: FormData;
  try {
    const raw = await readLimitedBytes(req.body, MAX_ALBUM_BODY_BYTES);
    form = await new Request(req.url, { method: 'POST', headers: { 'Content-Type': contentType }, body: raw }).formData();
  } catch { return json(413, { error: 'Не удалось прочитать изображения. Уменьшите размер группы.' }); }
  const files = form.getAll('files'), selectionCount = Number(form.get('selectionCount'));
  if (!Number.isInteger(selectionCount) || selectionCount < 1 || selectionCount > MAX_SELECTED_IMAGES || !files.length || files.length > selectionCount
    || files.some(file => !(file instanceof File)) || [...form.keys()].some(key => key !== 'files' && key !== 'selectionCount')) return json(400, { error: 'Для Fotora выберите от 1 до 50 изображений.' });
  if ((files as File[]).reduce((sum, file) => sum + file.size, 0) > MAX_ALBUM_BYTES) return json(413, { error: 'Слишком большая группа изображений.' });
  const photos: Photo[] = [];
  for (const file of files as File[]) {
    if (!file.size || file.size > MAX_IMAGE_BYTES) return json(413, { error: 'Один скриншот должен быть не больше 10 МБ.' });
    const bytes = new Uint8Array(await file.arrayBuffer()), image = inspectEvidenceImage(bytes);
    if (!image) return json(400, { error: 'Нужен PNG, JPG или WEBP до 40 мегапикселей.' });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (photos.some(photo => photo.hash === hash)) return json(400, { error: 'В подборке есть одинаковые скриншоты. Уберите повторяющиеся файлы.' });
    photos.push({ bytes, hash, ...image });
  }
  const reserved: Photo[] = [], links = new Set<string>(), expirations: (string | null)[] = [];
  const settle = async (status: 'ready' | 'failed' | 'uncertain', albumUrl: string | null = null, expiresAt: string | null = null) => {
    let synced = true;
    for (const photo of reserved) {
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        try { const { data, error } = await admin.rpc('settle_evidence_upload', { p_hash: photo.hash, p_ticket: photo.ticket, p_status: status, p_url: albumUrl, p_expires_at: expiresAt }); done = !error && data === true; } catch { /* Retry only database writes. */ }
      }
      synced = synced && done;
    }
    if (!synced) console.error('Evidence album settlement unavailable');
    return synced;
  };
  for (const photo of photos) {
    try {
      const { data, error } = await admin.rpc('reserve_evidence_upload', { p_user_id: user.id, p_hash: photo.hash, p_size: photo.bytes.length, p_mime: photo.mime });
      if (error || !data?.result) throw new Error();
      if (data.result === 'ready' && evidenceHostingUrl(data.url)) { links.add(evidenceHostingUrl(data.url)!); expirations.push(data.expiresAt ?? null); continue; }
      if (data.result === 'reserved' && typeof data.ticket === 'string') { reserved.push({ ...photo, ticket: data.ticket }); continue; }
      await settle('failed');
      if (data.result === 'limit') return json(429, { error: 'Достигнут суточный лимит изображений. Можно вставить готовые ссылки.', retryable: false });
      if (data.result === 'duplicate') return json(409, { error: 'Один из скриншотов уже входит в подборку другого аккаунта. Приложите собственные доказательства.', retryable: false });
      const retry = data.result === 'pending' ? 5 : Number.isInteger(data.retryAfterSeconds) && data.retryAfterSeconds > 0 ? data.retryAfterSeconds : 60;
      return json(409, { error: `Один из скриншотов уже обрабатывается. Повторите через ${retry} сек.`, retryable: data.retryable !== false, retryAfterSeconds: retry }, retry);
    } catch { await settle('failed'); return json(503, { error: 'Не удалось подготовить загрузку. Попробуйте позже.' }); }
  }
  for (const album of [...links].filter(url => fotoraAlbumUrl(url))) {
    try {
      const { data, error } = await admin.rpc('is_complete_evidence_album', { p_user_id: user.id, p_url: album, p_hashes: photos.map(photo => photo.hash) });
      if (error || typeof data !== 'boolean') throw new Error();
      if (!data) {
        await settle('failed');
        return json(409, { error: `Часть снимков входит в альбом с другими фото. Проверьте его и при необходимости вставьте ссылку вручную: ${album}`, retryable: false });
      }
    } catch { await settle('failed'); return json(503, { error: 'Не удалось проверить состав альбома. Попробуйте позже.' }); }
  }
  let synced = true;
  if (reserved.length) {
    try {
      const album = await uploadFotoraAlbum(reserved);
      links.add(album.url); expirations.push(album.expiresAt);
      synced = await settle('ready', album.url, album.expiresAt);
    } catch (error) {
      const uncertain = !(error instanceof FotoraUploadError) || error.uncertain;
      await settle(uncertain ? 'uncertain' : 'failed');
      return json(uncertain ? 502 : 503, { error: uncertain ? 'Fotora не подтвердила загрузку. Повторите через минуту или вставьте готовую ссылку.' : 'Не удалось соединиться с Fotora. Можно повторить загрузку или вставить ссылку вручную.', retryable: true, ...(uncertain ? { retryAfterSeconds: 60 } : {}) }, uncertain ? 60 : undefined);
    }
  }
  const expiresAt = expirations.length && expirations.every(value => value && Number.isFinite(Date.parse(value))) ? expirations.slice().sort()[0] : null;
  return json(200, { urls: [...links], expiresAt, provider: 'fotora', reused: !reserved.length, syncPending: !synced });
}

let activeAlbums = 0;
Deno.serve(async req => {
  if (req.method !== 'POST') return handleAlbum(req);
  if (activeAlbums >= 1) return json(429, { error: 'Загрузчик альбомов занят. Повторите через несколько секунд.' }, 5);
  activeAlbums++;
  try { return await handleAlbum(req); } finally { activeAlbums--; }
});
