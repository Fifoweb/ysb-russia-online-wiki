import { MAX_ALBUM_BYTES } from '../../supabase/functions/_shared/evidenceImages';

export type EvidenceProvider = 'allwebs' | 'fotora';
export const providerName = (provider: EvidenceProvider) => provider === 'allwebs' ? 'Allwebs' : 'Fotora';
// Allwebs is temporarily restored for small selections through the European route.
export const ALLWEBS_UPLOADS_ENABLED = true;
export const evidenceProvider = (selectedCount: number): EvidenceProvider => ALLWEBS_UPLOADS_ENABLED && selectedCount <= 10 ? 'allwebs' : 'fotora';
export const evidenceUploadHint = (multiple: boolean) => ALLWEBS_UPLOADS_ENABLED
  ? multiple ? 'До 10 фото — Allwebs, от 11 до 50 — Fotora (возможны перебои соединения).' : 'Загрузка через Allwebs.'
  : multiple ? 'Загрузка через Fotora — от 1 до 50 фото.' : 'Загрузка через Fotora.';

export function planEvidenceUploads<T extends { size: number }>(files: T[], provider: EvidenceProvider): T[][] {
  if (provider === 'allwebs') return files.map(file => [file]);
  const groups: T[][] = [];
  let group: T[] = [], size = 0;
  for (const file of files) {
    if (file.size > MAX_ALBUM_BYTES) throw new Error('Изображение слишком большое.');
    if (group.length && size + file.size > MAX_ALBUM_BYTES) { groups.push(group); group = []; size = 0; }
    group.push(file); size += file.size;
  }
  if (group.length) groups.push(group);
  return groups;
}
