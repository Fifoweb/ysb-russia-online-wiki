import { useEffect, useId, useRef, useState, type ReactNode, type ClipboardEvent, type DragEvent } from 'react';
import { ArrowClockwise, CheckCircle, ClipboardText, FileImage, UploadSimple, X } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { IMAGE_ACCEPT, imageFileError, insertEvidenceUrl, removeEvidenceUrl, uploadEvidenceImage } from '../lib/evidenceUpload';
import { useEvidenceUploadStatus } from './EvidenceUploadsProvider';
import '../evidence-upload.css';

type Item = { id: string; file: File; preview: string; status: 'queued' | 'uploading' | 'done' | 'error'; error?: string; url?: string; expiresAt?: string | null; originalValue: string; added?: boolean; retryable?: boolean };
interface Props {
  children: ReactNode; value: string; onChange: (value: string) => void;
  multiple?: boolean; maxLength?: number; maxFiles?: number; disabled?: boolean;
}

export default function EvidenceUpload({ children, value, onChange, multiple = false, maxLength = 1000, maxFiles = 10, disabled = false }: Props) {
  const { user } = useAuth();
  const id = useId();
  const { update } = useEvidenceUploadStatus();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items); itemsRef.current = items;
  const latest = useRef({ value, onChange, disabled }); latest.current = { value, onChange, disabled };
  const active = useRef(new Map<string, AbortController>());
  const alive = useRef(true);
  const previews = useRef(new Set<string>());
  const pending = items.filter(item => item.status === 'queued' || item.status === 'uploading').length;
  const failed = items.filter(item => item.status === 'error').length;
  useEffect(() => { update(id, { pending, failed }); }, [id, pending, failed, update]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      active.current.forEach(controller => controller.abort()); active.current.clear();
      previews.current.forEach(url => URL.revokeObjectURL(url)); previews.current.clear();
      update(id, null);
    };
  }, [id, update]);

  const patch = (key: string, values: Partial<Item>) => {
    if (alive.current) setItems(current => current.map(item => item.id === key ? { ...item, ...values } : item));
  };
  const write = (next: string) => { latest.current.value = next; latest.current.onChange(next); };
  const insert = (item: Item, url: string) => {
    const current = latest.current.value;
    if (!multiple && current !== item.originalValue && current.trim() !== url) return { inserted: false, added: false };
    const next = insertEvidenceUrl(current, url, multiple, maxLength, multiple ? maxFiles : 1);
    if (next === null) return { inserted: false, added: false };
    write(next); return { inserted: true, added: next !== current };
  };

  useEffect(() => {
    if (!user || disabled) return;
    for (const item of items.filter(item => item.status === 'queued')) {
      if (active.current.size >= 2) break;
      if (active.current.has(item.id)) continue;
      const controller = new AbortController(); active.current.set(item.id, controller);
      patch(item.id, { status: 'uploading' });
      void uploadEvidenceImage(item.file, user.id, controller.signal).then(result => {
        if (!alive.current || controller.signal.aborted) return;
        const { inserted, added } = insert(item, result.url);
        patch(item.id, { ...result, added, status: inserted ? 'done' : 'error', error: inserted ? undefined : 'Файл загружен, но ссылка не добавлена: поле изменилось или достигнут лимит. Освободите место и нажмите «Подставить ссылку».' });
      }).catch(error => {
        if (alive.current && !controller.signal.aborted) patch(item.id, { status: 'error', error: error instanceof Error ? error.message : 'Не удалось загрузить файл.', retryable: (error as { retryable?: boolean })?.retryable !== false });
      }).finally(() => { active.current.delete(item.id); });
    }
  }, [items, user?.id, disabled]);

  const add = (files: File[]) => {
    if (!user || latest.current.disabled || input.current?.matches(':disabled')) return;
    const current = itemsRef.current;
    const limit = multiple ? maxFiles : 1;
    if (current.length + files.length > limit) { setNotice(`В этом поле можно прикрепить не больше ${limit} ${limit === 1 ? 'изображения' : 'изображений'}. Уберите лишние файлы из списка.`); return; }
    if (files.reduce((sum, file) => sum + file.size, 0) + current.reduce((sum, item) => sum + item.file.size, 0) > 100 * 1024 * 1024) { setNotice('За один раз можно выбрать до 100 МБ изображений.'); return; }
    setNotice('');
    const added: Item[] = [];
    for (const file of files) {
      if ([...current, ...added].some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) { setNotice('Повторно выбранные файлы пропущены.'); continue; }
      const error = imageFileError(file);
      const preview = error ? '' : URL.createObjectURL(file); if (preview) previews.current.add(preview);
      added.push({ id: crypto.randomUUID(), file, preview, status: error ? 'error' : 'queued', error: error ?? undefined, originalValue: latest.current.value });
    }
    if (added.length) {
      update(id, { pending: pending + added.filter(item => item.status === 'queued').length, failed: failed + added.filter(item => item.status === 'error').length });
      setItems(current => [...current, ...added]);
    }
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
      <input ref={input} hidden type="file" accept={IMAGE_ACCEPT} multiple={multiple} disabled={disabled || !user}
        onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <button type="button" className="evidence-upload-select" disabled={disabled || !user} onClick={() => input.current?.click()}><UploadSimple size={20} aria-hidden="true" />Загрузить на Allwebs</button>
      <span>или перетащите {multiple ? 'скриншоты' : 'скриншот'} сюда, либо вставьте Ctrl+V в поле</span>
      <small>PNG, JPG, WEBP · до 10 МБ на файл. В отчёт добавятся ссылки на загруженные изображения.</small>
    </div>
    {notice && <p className="evidence-upload-notice" role="status">{notice}</p>}
    {items.length > 0 && <ul className="evidence-upload-list" aria-label="Выбранные скриншоты">{items.map(item => <li key={item.id} data-status={item.status}>
      {item.preview ? <img src={item.preview} alt="" width={56} height={56} loading="lazy" decoding="async" /> : <FileImage size={32} aria-hidden="true" />}
      <div className="evidence-upload-detail"><strong title={item.file.name}>{item.file.name}</strong><span role="status">{item.status === 'queued' ? 'В очереди…' : item.status === 'uploading' ? 'Загружаем…' : item.status === 'done' ? <><CheckCircle size={16} aria-hidden="true" />Ссылка добавлена</> : item.error}</span>
        {item.expiresAt && item.status === 'done' && <small>Хостинг указал срок до {new Date(item.expiresAt).toLocaleDateString('ru-RU')}</small>}
        {item.status === 'uploading' && <progress aria-label={`Загрузка ${item.file.name}`} />}
        {item.status === 'error' && item.url && <button className="evidence-upload-insert" type="button" disabled={disabled} onClick={() => {
          const next = insertEvidenceUrl(latest.current.value, item.url!, multiple, maxLength, multiple ? maxFiles : 1);
          if (next !== null) { const added = next !== latest.current.value; write(next); patch(item.id, { status: 'done', error: undefined, added }); }
        }}><ClipboardText size={16} aria-hidden="true" />Подставить ссылку</button>}
      </div>
      {item.status === 'error' && !item.url && item.retryable !== false && !imageFileError(item.file) && <button className="evidence-upload-icon" type="button" disabled={disabled} aria-label={`Повторить загрузку ${item.file.name}`} onClick={() => {
        const invalid = imageFileError(item.file); if (!invalid) patch(item.id, { status: 'queued', error: undefined });
      }}><ArrowClockwise size={20} aria-hidden="true" /></button>}
      <button className="evidence-upload-icon" type="button" disabled={disabled || item.status === 'uploading'} aria-label={`Убрать ${item.file.name} из формы`} onClick={() => {
        if (item.url && item.added) write(multiple ? removeEvidenceUrl(latest.current.value, item.url) : latest.current.value.trim() === item.url ? '' : latest.current.value);
        if (item.preview) { URL.revokeObjectURL(item.preview); previews.current.delete(item.preview); }
        setItems(current => current.filter(record => record.id !== item.id && (!item.added || !item.url || record.url !== item.url)));
      }}><X size={18} aria-hidden="true" /></button>
    </li>)}</ul>}
  </div>;
}
