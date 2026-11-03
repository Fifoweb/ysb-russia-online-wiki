import { supabase } from './supabase';
import { getApplicationSession } from './auth';
import { getFunctionErrorMessage } from './functionError';
import { allwebsImageUrl, MAX_IMAGE_BYTES } from '../../supabase/functions/_shared/evidenceImages';

export { MAX_IMAGE_BYTES };
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
let active = 0;
const waiting: (() => void)[] = [];
async function acquireUpload(signal: AbortSignal) {
  if (signal.aborted) throw new Error('Загрузка отменена.');
  if (active < 2) { active++; return; }
  await new Promise<void>((resolve, reject) => {
    const ready = () => { signal.removeEventListener('abort', cancel); resolve(); };
    const cancel = () => { const index = waiting.indexOf(ready); if (index >= 0) waiting.splice(index, 1); reject(new Error('Загрузка отменена.')); };
    waiting.push(ready); signal.addEventListener('abort', cancel, { once: true });
  });
}
function releaseUpload() { const next = waiting.shift(); if (next) next(); else active--; }

export function imageFileError(file: File): string | null {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'Поддерживаются только PNG, JPG и WEBP.';
  if (!file.size || file.size > MAX_IMAGE_BYTES) return 'Размер одного изображения — от 1 байта до 10 МБ.';
  return null;
}

export function insertEvidenceUrl(value: string, url: string, multiple: boolean, maxLength: number, maxFiles: number): string | null {
  if (!multiple) return url.length <= maxLength ? url : null;
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.includes(url)) return value;
  const links = words.filter(word => /^https:\/\//i.test(word));
  if (links.length >= maxFiles) return null;
  const next = value.trim() ? value.trimEnd() + '\n' + url : url;
  return next.length <= maxLength ? next : null;
}

export function removeEvidenceUrl(value: string, url: string): string {
  return value.split(/(\s+)/).filter(word => word !== url).join('').trim();
}

export async function uploadEvidenceImage(file: File, userId: string, signal: AbortSignal): Promise<{ url: string; expiresAt: string | null }> {
  const invalid = imageFileError(file);
  if (invalid) throw new Error(invalid);
  await acquireUpload(signal);
  try {
    const auth = await getApplicationSession(userId);
    if (!auth.session) throw new Error(auth.error);
    if (!supabase) throw new Error('Загрузка временно недоступна.');
    const { data, error } = await supabase.functions.invoke('upload-evidence-image', {
      body: file, headers: { Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': file.type }, signal, timeout: 75_000,
    });
    if (error) {
      let retryable = true;
      try { retryable = (await (error as { context?: Response }).context?.clone().json())?.retryable !== false; } catch { /* Use the default for transport failures. */ }
      throw Object.assign(new Error(await getFunctionErrorMessage(error, 'Не удалось загрузить скриншот. Проверьте соединение и попробуйте ещё раз.')), { retryable });
    }
    const url = allwebsImageUrl(data?.url);
    if (!url) throw new Error('Сервис не подтвердил ссылку на изображение.');
    return { url, expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null };
  } finally { releaseUpload(); }
}
