import { supabase } from './supabase';
import { getApplicationSession } from './auth';
import { getFunctionErrorMessage } from './functionError';
import { evidenceHostingUrl, MAX_IMAGE_BYTES, MAX_SELECTED_IMAGES } from '../../supabase/functions/_shared/evidenceImages';
import type { EvidenceProvider } from './evidenceUploadPlan';

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

export function insertEvidenceUrls(value: string, urls: string[], multiple: boolean, maxLength: number, maxFiles: number): string | null {
  if (!urls.length || !multiple && urls.length !== 1) return null;
  let next = value;
  for (const url of new Set(urls)) {
    const inserted = insertEvidenceUrl(next, url, multiple, maxLength, maxFiles);
    if (inserted === null) return null;
    next = inserted;
  }
  return next;
}

async function invokeUpload(name: string, body: File | FormData, userId: string, signal: AbortSignal) {
  await acquireUpload(signal);
  try {
    const auth = await getApplicationSession(userId);
    if (!auth.session) throw new Error(auth.error);
    if (!supabase) throw new Error('Загрузка временно недоступна.');
    const { data, error } = await supabase.functions.invoke(name, {
      body, headers: { Authorization: `Bearer ${auth.session.access_token}`, ...(body instanceof File ? { 'Content-Type': body.type } : {}) }, signal, timeout: body instanceof File ? 75_000 : 120_000,
    });
    if (error) {
      let retryable = true;
      try { retryable = (await (error as { context?: Response }).context?.clone().json())?.retryable !== false; } catch { /* Use the default for transport failures. */ }
      throw Object.assign(new Error(await getFunctionErrorMessage(error, 'Не удалось загрузить скриншот. Проверьте соединение и попробуйте ещё раз.')), { retryable });
    }
    return data;
  } finally { releaseUpload(); }
}

const expiration = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

export async function uploadEvidenceImage(file: File, userId: string, signal: AbortSignal): Promise<{ url: string; expiresAt: string | null }> {
  const invalid = imageFileError(file); if (invalid) throw new Error(invalid);
  const data = await invokeUpload('upload-evidence-image', file, userId, signal);
  const url = evidenceHostingUrl(data?.url);
  if (!url) throw new Error('Сервис не подтвердил ссылку на изображение.');
  return { url, expiresAt: expiration(data.expiresAt) };
}

export async function uploadEvidenceBatch(files: File[], provider: EvidenceProvider, selectionCount: number, userId: string, signal: AbortSignal): Promise<{ urls: string[]; expiresAt: string | null }> {
  for (const file of files) { const invalid = imageFileError(file); if (invalid) throw new Error(invalid); }
  if (provider === 'allwebs') {
    if (files.length !== 1) throw new Error('Выберите один скриншот для Allwebs.');
    const result = await uploadEvidenceImage(files[0], userId, signal);
    return { urls: [result.url], expiresAt: result.expiresAt };
  }
  const form = new FormData();
  form.append('selectionCount', String(selectionCount));
  files.forEach((file, index) => form.append('files', file, `screenshot-${index + 1}`));
  const data = await invokeUpload('upload-evidence-album', form, userId, signal);
  if (!Array.isArray(data?.urls) || !data.urls.length || data.urls.length > MAX_SELECTED_IMAGES || data.urls.some((url: unknown) => !evidenceHostingUrl(url))) throw new Error('Сервис не подтвердил ссылки на изображения.');
  return { urls: [...new Set<string>(data.urls.map(evidenceHostingUrl))], expiresAt: expiration(data.expiresAt) };
}
