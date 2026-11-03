import { useEffect, useId, useRef, useState, type ReactNode, type ClipboardEvent, type DragEvent } from 'react';
import { ArrowClockwise, CheckCircle, ClipboardText, FileImage, Images, UploadSimple, X } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { IMAGE_ACCEPT, imageFileError, insertEvidenceUrls, removeEvidenceUrl, uploadEvidenceBatch } from '../lib/evidenceUpload';
import { evidenceProvider, planEvidenceUploads, providerName, type EvidenceProvider } from '../lib/evidenceUploadPlan';
import { MAX_SELECTED_IMAGES, fotoraAlbumUrl } from '../../supabase/functions/_shared/evidenceImages';
import { useEvidenceUploadStatus } from './EvidenceUploadsProvider';
import '../evidence-upload.css';

type Item = {
  id: string; files: File[]; preview: string; status: 'selected' | 'queued' | 'uploading' | 'done' | 'error';
  provider?: EvidenceProvider; selectionCount?: number; error?: string; urls?: string[]; expiresAt?: string | null;
  originalValue: string; retryable?: boolean;
};
interface Props { children: ReactNode; value: string; onChange: (value: string) => void; multiple?: boolean; maxLength?: number; maxFiles?: number; disabled?: boolean; }
const waiting = (item: Item) => item.status === 'queued' || item.status === 'uploading';

export default function EvidenceUpload({ children, value, onChange, multiple = false, maxLength = 1000, maxFiles = 10, disabled = false }: Props) {
  const { user } = useAuth();
  const id = useId(), { update } = useEvidenceUploadStatus();
  const [items, setItems] = useState<Item[]>([]), [dragging, setDragging] = useState(false), [notice, setNotice] = useState('');
  const [schedule, setSchedule] = useState(0);
  const input = useRef<HTMLInputElement>(null), itemsRef = useRef(items); itemsRef.current = items;
  const latest = useRef({ value, onChange, disabled }); latest.current = { value, onChange, disabled };
  const active = useRef(new Map<string, AbortController>()), previews = useRef(new Map<File, string>()), inserted = useRef(new Set<string>());
  const alive = useRef(true);
  const busy = items.some(waiting), selected = items.filter(item => item.status === 'selected');
  const imageCount = items.reduce((sum, item) => sum + item.files.filter(file => !imageFileError(file)).length, 0);
  const provider = evidenceProvider(imageCount);
  const change = (mutate: (current: Item[]) => Item[]) => {
    if (!alive.current) return;
    const next = mutate(itemsRef.current); itemsRef.current = next; setItems(next);
    update(id, { pending: next.filter(waiting).length, selected: next.filter(item => item.status === 'selected').length, failed: next.filter(item => item.status === 'error').length });
  };
  const patch = (key: string, values: Partial<Item>) => change(current => current.map(item => item.id === key ? { ...item, ...values } : item));
  useEffect(() => () => {
    alive.current = false; active.current.forEach(controller => controller.abort()); active.current.clear();
    previews.current.forEach(url => URL.revokeObjectURL(url)); previews.current.clear(); update(id, null);
  }, [id, update]);
  useEffect(() => { alive.current = true; }, []);
  const write = (next: string) => { latest.current.value = next; latest.current.onChange(next); };
  const insert = (item: Item, urls: string[], explicit = false) => {
    const current = latest.current.value;
    if (!explicit && !multiple && current !== item.originalValue && !urls.includes(current.trim())) return false;
    const next = insertEvidenceUrls(current, urls, multiple, maxLength, multiple ? maxFiles : 1);
    if (next === null) return false;
    const old = new Set(current.trim().split(/\s+/));
    urls.forEach(url => { if (!old.has(url)) inserted.current.add(url); });
    write(next); return true;
  };
  useEffect(() => {
    if (!user || disabled) return;
    for (const item of items.filter(item => item.status === 'queued')) {
      if (active.current.size >= (item.provider === 'fotora' ? 1 : 2)) break;
      if (active.current.has(item.id)) continue;
      const controller = new AbortController(); active.current.set(item.id, controller); patch(item.id, { status: 'uploading' });
      void uploadEvidenceBatch(item.files, item.provider!, item.selectionCount!, user.id, controller.signal).then(result => {
        if (!alive.current || controller.signal.aborted) return;
        const added = insert(item, result.urls);
        patch(item.id, { ...result, status: added ? 'done' : 'error', error: added ? undefined : 'Загрузка завершена, но ссылки не добавлены: поле изменилось или достигнут лимит. Освободите место и нажмите «Подставить ссылки».' });
      }).catch(error => {
        if (alive.current && !controller.signal.aborted) patch(item.id, { status: 'error', error: error instanceof Error ? error.message : 'Не удалось загрузить файлы.', retryable: (error as { retryable?: boolean })?.retryable !== false });
      }).finally(() => { active.current.delete(item.id); if (alive.current) setSchedule(value => value + 1); });
    }
  }, [items, user?.id, disabled, schedule]);
  const add = (files: File[]) => {
    if (!user || latest.current.disabled || itemsRef.current.some(waiting)) return;
    const current = itemsRef.current, existing = current.flatMap(item => item.files);
    const unique: File[] = [];
    for (const file of files) if (![...existing, ...unique].some(old => old.name === file.name && old.size === file.size && old.lastModified === file.lastModified)) unique.push(file);
    if (!unique.length) { setNotice('Выбранные файлы уже есть в списке.'); return; }
    const limit = multiple ? MAX_SELECTED_IMAGES : 1;
    if (existing.length + unique.length > limit) { setNotice(`В этом поле можно выбрать не больше ${limit} фото. Уберите лишние файлы из списка.`); return; }
    if ([...existing, ...unique].reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) { setNotice('В одной подборке можно выбрать до 100 МБ изображений.'); return; }
    setNotice('');
    const added = unique.map(file => {
      const error = imageFileError(file), preview = error ? '' : URL.createObjectURL(file); if (preview) previews.current.set(file, preview);
      return { id: crypto.randomUUID(), files: [file], preview, status: error ? 'error' : 'selected', error: error ?? undefined, originalValue: latest.current.value, retryable: false } as Item;
    });
    change(current => [...current, ...added]);
  };
  const start = () => {
    if (!user || disabled || itemsRef.current.some(waiting)) return;
    const current = itemsRef.current, draft = current.filter(item => item.status === 'selected');
    const total = current.reduce((sum, item) => sum + item.files.filter(file => !imageFileError(file)).length, 0), host = evidenceProvider(total);
    const groups = planEvidenceUploads(draft.flatMap(item => item.files), host);
    const jobs: Item[] = groups.map(files => ({ id: crypto.randomUUID(), files, preview: previews.current.get(files[0]) ?? '', provider: host, selectionCount: total, originalValue: latest.current.value, status: 'queued' }));
    change(current => [...current.filter(item => item.status !== 'selected'), ...jobs]);
  };
  const remove = (item: Item) => {
    active.current.get(item.id)?.abort();
    const remaining = itemsRef.current.filter(record => record.id !== item.id);
    let next = latest.current.value;
    for (const url of item.urls ?? []) if (inserted.current.has(url) && !remaining.some(record => record.urls?.includes(url))) {
      next = multiple ? removeEvidenceUrl(next, url) : next.trim() === url ? '' : next; inserted.current.delete(url);
    }
    if (next !== latest.current.value) write(next);
    item.files.forEach(file => { const preview = previews.current.get(file); if (preview) URL.revokeObjectURL(preview); previews.current.delete(file); });
    change(() => remaining);
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => file !== null);
    if (files.length) { event.preventDefault(); add(files); }
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault(); setDragging(false); add(Array.from(event.dataTransfer.files));
  };
  return <div className={'evidence-upload-field' + (dragging ? ' is-dragging' : '')} onPaste={paste}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={drop}>
    {children}
    <div className="evidence-upload-tools" role="group" aria-label="Загрузка скриншотов">
      <input ref={input} hidden type="file" accept={IMAGE_ACCEPT} multiple={multiple} disabled={disabled || busy || !user} onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <button type="button" className="evidence-upload-select" disabled={disabled || busy || !user} onClick={() => input.current?.click()}><Images size={20} aria-hidden="true" />{multiple ? 'Выбрать скриншоты' : 'Выбрать скриншот'}</button>
      <span>или перетащите {multiple ? 'снимки' : 'снимок'} сюда, либо вставьте Ctrl+V в поле</span>
      <small>PNG, JPG, WEBP · до 10 МБ на файл.{multiple ? ' До 10 фото — Allwebs, от 11 до 50 — альбомы Fotora.' : ' Загрузка через Allwebs.'}</small>
      {selected.length > 0 && <div className="evidence-upload-plan" role="status"><span>{selected.length === imageCount ? `Выбрано ${imageCount} фото` : `Всего ${imageCount} фото · новых ${selected.length}`} · {providerName(provider)}</span>
        <button type="button" className="evidence-upload-select evidence-upload-start" disabled={disabled || busy || !user} onClick={start}><UploadSimple size={20} aria-hidden="true" />Загрузить выбранные</button>
      </div>}
    </div>
    {notice && <p className="evidence-upload-notice" role="status">{notice}</p>}
    {items.length > 0 && <ul className="evidence-upload-list" aria-label="Выбранные скриншоты">{items.map(item => {
      const albumLinks = item.urls?.map(fotoraAlbumUrl).filter((url): url is string => Boolean(url)) ?? [];
      const album = item.provider === 'fotora', title = album ? `${item.urls && (albumLinks.length !== 1 || item.urls.length !== 1) ? 'Подборка' : 'Альбом Fotora'} · ${item.files.length} фото` : item.files[0].name;
      return <li key={item.id} data-status={item.status}>
        {item.preview ? <img src={item.preview} alt="" width={56} height={56} loading="lazy" decoding="async" /> : <FileImage size={32} aria-hidden="true" />}
        <div className="evidence-upload-detail"><strong title={title}>{title}</strong><span role="status">{item.status === 'selected' ? 'Готово к загрузке' : item.status === 'queued' ? 'В очереди…' : item.status === 'uploading' ? `Загружаем на ${providerName(item.provider!)}…` : item.status === 'done' ? <><CheckCircle size={16} aria-hidden="true" />{(item.urls?.length ?? 0) > 1 ? 'Ссылки добавлены' : 'Ссылка добавлена'}</> : item.error}</span>
          {item.expiresAt && item.status === 'done' && <small>Хостинг указал срок до {new Date(item.expiresAt).toLocaleDateString('ru-RU')}</small>}
          {albumLinks.map((url, index) => <a key={url} className="evidence-upload-insert" href={url} target="_blank" rel="noopener noreferrer">{albumLinks.length > 1 ? `Открыть альбом ${index + 1}` : 'Открыть альбом'}</a>)}
          {item.status === 'uploading' && <progress aria-label={`Загрузка: ${title}`} />}
          {item.status === 'error' && item.urls && <button className="evidence-upload-insert" type="button" disabled={disabled} onClick={() => { if (insert(item, item.urls!, true)) patch(item.id, { status: 'done', error: undefined }); }}><ClipboardText size={16} aria-hidden="true" />Подставить ссылки</button>}
        </div>
        {item.status === 'error' && !item.urls && item.provider && item.retryable !== false && <button className="evidence-upload-icon" type="button" disabled={disabled || busy} aria-label={`Повторить загрузку: ${title}`} onClick={() => patch(item.id, { status: 'queued', error: undefined })}><ArrowClockwise size={20} aria-hidden="true" /></button>}
        <button className="evidence-upload-icon" type="button" disabled={disabled || item.status === 'uploading'} aria-label={`Убрать из формы: ${title}`} onClick={() => remove(item)}><X size={18} aria-hidden="true" /></button>
      </li>;
    })}</ul>}
  </div>;
}
