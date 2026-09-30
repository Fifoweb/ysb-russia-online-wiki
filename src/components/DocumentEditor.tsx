import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import { DocConfig, toCyrillicCode } from '../data/docConfigs';
import { useAuth } from '../lib/auth';
import { loadRemoteBookmarks, saveRemoteBookmarks } from '../lib/db';

interface Section { id: number; heading: string; }
interface Signatory { id: number; name: string; title: string; }
interface Draft {
  title: string; sections: Section[]; signatories: Signatory[]; fields: string[];
  textBlocks?: Record<string, string>;
  fieldValues?: Record<string, string>;
  signatureOverrides?: number[];
}
interface Bookmark { name: string; sectionId: number; snapshot?: Draft; }

interface DocEditorProps { doc: DocConfig | null; onClose: () => void; }

const readText = (el: HTMLElement) => (el.innerText ?? el.textContent ?? '').replace(/\r\n?/g, '\n');

const editableTextProps = (key: string, label: string) => ({
  contentEditable: 'plaintext-only' as const,
  suppressContentEditableWarning: true,
  'data-doc-text': key,
  role: 'textbox',
  'aria-label': label,
  'aria-multiline': true,
});

const E = ({ ph, onText, hidden, mark, fieldKey }: { ph?: string; onText?: (v: string) => void; hidden?: boolean; mark?: string; fieldKey: string }) => (
  <span contentEditable="plaintext-only" suppressContentEditableWarning data-placeholder={ph || ''} data-mark={mark} data-field-key={fieldKey}
    role="textbox" aria-label={ph || 'Поле документа'} aria-multiline="true"
    onInput={e => {
      // Hide the dashed underline once the field is filled
      const el = e.currentTarget;
      const v = readText(el);
      el.classList.toggle('filled', v.trim().length > 0);
      onText?.(v);
    }}
    className="inline-block whitespace-pre-wrap border-b border-dashed border-gray-400 outline-none focus:border-gray-600 focus:bg-gray-100 rounded px-1 -mx-0.5 min-w-[50px] transition-all empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 empty:before:italic"
    // `hidden` via inline style: the inline-block class would override the [hidden] attribute
    style={{ color: '#000', ...(hidden ? { display: 'none' } : {}) }} />
);

// Signature = the person's name in the Brittany Signature font (thin pen look).
// Brittany Signature has no Cyrillic glyphs, so Cyrillic names automatically
// fall back to 'Bad Script' (a thin Cyrillic handwriting font of the same style).
function Signature({ name }: { name: string }) {
  let seed = 7;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rotate = -(2 + (seed % 30) / 10); // -2..-5 deg
  return (
    <div style={{
      fontFamily: `'Brittany Signature', 'Bad Script', cursive`,
      fontSize: 22,
      fontWeight: 400,
      color: '#161616',
      transform: `rotate(${rotate}deg)`,
      transformOrigin: 'bottom right',
      textAlign: 'right',
      whiteSpace: 'nowrap',
      lineHeight: 1.15,
      userSelect: 'none',
    }}>
      {name.trim()}
    </div>
  );
}


function buildInitialSections(doc: DocConfig | null): Section[] {
  if (!doc || !doc.body.length) return [{ id: 1, heading: 'Текст раздела' }];
  return doc.body.map((b, i) => ({ id: i + 1, heading: b }));
}

function loadBookmarks(code: string): Bookmark[] {
  try { return JSON.parse(localStorage.getItem(`usb-bm-${code}`) || '[]'); } catch { return []; }
}

function saveBookmarksToStorage(code: string, items: Bookmark[]) {
  localStorage.setItem(`usb-bm-${code}`, JSON.stringify(items));
}

const DEFAULT_SIGNATORY: Signatory = { id: 1, name: 'Кира Комиссарова', title: 'Генерал-майор' };

const scrollTo = (id: number) => {
  const el = document.getElementById(`sec-${id}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

export default function DocumentEditor({ doc, onClose }: DocEditorProps) {
  const docRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const code = doc?.code || 'BLANK';
  // The document always opens fresh; saved text lives inside bookmarks (snapshots)
  const [sections, setSections] = useState<Section[]>(() => buildInitialSections(doc));
  const [signatories, setSignatories] = useState<Signatory[]>(() => [{ ...DEFAULT_SIGNATORY }]);
  const [docTitle, setDocTitle] = useState(() => doc?.title || 'НАЗВАНИЕ ДОКУМЕНТА');
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks(code));
  const [draftRevision, setDraftRevision] = useState(0);
  const [sectionEditor, setSectionEditor] = useState<{ id: number; text: string } | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  // Typed names per signatory — drives the generated signature
  const [sigTexts, setSigTexts] = useState<Record<number, string>>({});
  const [signatureOverrides, setSignatureOverrides] = useState<number[]>([]);
  const signatureOverridesRef = useRef(signatureOverrides);
  signatureOverridesRef.current = signatureOverrides;
  const nextSecId = useRef(Math.max(0, ...sections.map(section => section.id)) + 1);
  const nextSigId = useRef(2);
  const signatoriesRef = useRef(signatories);
  signatoriesRef.current = signatories;
  // Snapshot waiting to be applied after React re-renders the restored structure
  const pendingSnapshotRef = useRef<Draft & { sectionId: number } | null>(null);

  const { user } = useAuth();

  // Logged in: bookmarks live in the account (cloud). Guest: localStorage fallback.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadRemoteBookmarks(user.id, code, loadBookmarks(code))
      .then(items => { if (!cancelled) setBookmarks(items as Bookmark[]); })
      .catch(() => { if (!cancelled) setNotice({ error: true, text: 'Не удалось загрузить копии из аккаунта. Копии в браузере доступны.' }); });
    return () => { cancelled = true; };
  }, [user, code]);

  const syncBookmarks = useCallback(async (items: Bookmark[]) => {
    try {
      saveBookmarksToStorage(code, items);
    } catch {
      setNotice({ error: true, text: 'Не удалось сохранить копию в браузере. Проверьте свободное место.' });
      return;
    }
    setBookmarks(items);
    if (user) {
      try {
        if (!await saveRemoteBookmarks(user.id, code, items)) {
          setNotice({ error: true, text: 'Копия сохранена в браузере, но синхронизация с аккаунтом не удалась. Попробуйте сохранить ещё раз.' });
          return;
        }
      } catch {
        setNotice({ error: true, text: 'Копия сохранена в браузере. Аккаунт временно недоступен для синхронизации.' });
        return;
      }
    }
    setNotice({ error: false, text: user ? 'Личные копии сохранены в браузере и аккаунте.' : 'Личные копии сохранены в этом браузере.' });
  }, [code, user]);

  const addSection = () => setSections(s => [...s, { id: nextSecId.current++, heading: 'Текст раздела' }]);
  const removeSection = (id: number) => {
    setSections(s => s.filter(x => x.id !== id));
    if (sectionEditor?.id === id) setSectionEditor(null);
  };

  const addSignatory = () => setSignatories(s => [...s, { id: nextSigId.current++, name: 'ФИО', title: 'Должность' }]);
  const removeSignatory = (id: number) => setSignatories(s => s.filter(x => x.id !== id));

  // Snapshot everything the user typed: field values, sections, title, signatories
  const captureDraft = useCallback((): Draft | undefined => {
    const root = docRef.current;
    if (!root) return undefined;
    const spans = Array.from(root.querySelectorAll<HTMLElement>('[data-placeholder]'));
    const fields = spans.map(readText);
    const fieldValues = Object.fromEntries(spans.map(sp => [sp.dataset.fieldKey || '', readText(sp)]).filter(([key]) => key));
    const textBlocks = Object.fromEntries(Array.from(root.querySelectorAll<HTMLElement>('[data-doc-text]'))
      .map(el => [el.dataset.docText!, readText(el)]));
    const secs = Array.from(root.querySelectorAll('[id^="sec-"]')).map(d => ({
      id: Number(d.id.replace('sec-', '')),
      // Rebuild section text: data-seg spans = editable text, data-placeholder = [FIELD]
      heading: Array.from(d.querySelectorAll<HTMLElement>('[data-seg], [data-placeholder]'))
        .map(el => el.hasAttribute('data-seg') ? readText(el) : `[${el.getAttribute('data-placeholder') || ''}]`)
        .join(''),
    }));
    return {
      title: root.querySelector<HTMLElement>('[data-doc-title]') ? readText(root.querySelector<HTMLElement>('[data-doc-title]')!) : '',
      sections: secs,
      signatories: signatoriesRef.current,
      fields,
      fieldValues,
      textBlocks,
      signatureOverrides: signatureOverridesRef.current,
    };
  }, []);

  const addBookmark = () => {
    const name = prompt('Название личной копии:');
    if (!name) return;
    // Bind the bookmark to the section closest to the current scroll position
    const container = document.getElementById('doc-scroll');
    let targetId = sections[0]?.id ?? 1;
    if (container) {
      const top = container.getBoundingClientRect().top;
      let best = Infinity;
      for (const sec of sections) {
        const el = document.getElementById(`sec-${sec.id}`);
        if (!el) continue;
        const d = Math.abs(el.getBoundingClientRect().top - top);
        if (d < best) { best = d; targetId = sec.id; }
      }
    }
    // Save a full snapshot of the document into the bookmark
    void syncBookmarks([...bookmarks, { name, sectionId: targetId, snapshot: captureDraft() }]);
  };
  const removeBookmark = (i: number) => void syncBookmarks(bookmarks.filter((_, idx) => idx !== i));

  const editSection = (id: number) => {
    const section = captureDraft()?.sections.find(item => item.id === id);
    if (section) setSectionEditor({ id, text: section.heading });
  };

  const applySectionText = () => {
    if (!sectionEditor) return;
    const snapshot = captureDraft();
    if (!snapshot) return;
    setSections(snapshot.sections.map(section => section.id === sectionEditor.id ? { ...section, heading: sectionEditor.text } : section));
    setDocTitle(snapshot.title);
    pendingSnapshotRef.current = { ...snapshot, sectionId: sectionEditor.id };
    setDraftRevision(revision => revision + 1);
    setSectionEditor(null);
  };

  // Restore the document content saved in a bookmark
  const applyBookmark = (b: Bookmark) => {
    if (!b.snapshot) { scrollTo(b.sectionId); return; }
    setSections(b.snapshot.sections);
    setSignatories(b.snapshot.signatories);
    setDocTitle(b.snapshot.title);
    setSigTexts({});
    setSignatureOverrides(b.snapshot.signatureOverrides || []);
    setSectionEditor(null);
    nextSecId.current = Math.max(0, ...b.snapshot.sections.map(s => s.id)) + 1;
    nextSigId.current = Math.max(0, ...b.snapshot.signatories.map(s => s.id)) + 1;
    pendingSnapshotRef.current = { ...b.snapshot, sectionId: b.sectionId };
    setDraftRevision(revision => revision + 1);
    setNotice({ error: false, text: 'Сохранённая копия восстановлена.' });
  };

  // After a snapshot is applied, React re-renders sections/signatories first;
  // only then fill the field values (their count depends on the structure)
  useEffect(() => {
    const p = pendingSnapshotRef.current;
    if (!p) return;
    pendingSnapshotRef.current = null;
    const root = docRef.current;
    if (root) {
      const spans = root.querySelectorAll<HTMLElement>('[data-placeholder]');
      let legacyIndex = 0;
      spans.forEach(sp => {
        // Older snapshots did not include the editable signature field.
        const key = sp.dataset.fieldKey || '';
        const v = p.fieldValues ? p.fieldValues[key] ?? '' : key.endsWith(':signature') ? '' : p.fields[legacyIndex++] || '';
        sp.textContent = v;
        sp.classList.toggle('filled', v.trim().length > 0);
      });
      root.querySelectorAll<HTMLElement>('[data-doc-text]').forEach(el => {
        const value = p.textBlocks?.[el.dataset.docText || ''];
        if (value !== undefined) el.textContent = value;
      });
      // Restored signatory names -> regenerate their signatures
      const names: Record<number, string> = {};
      root.querySelectorAll('[data-mark^="sig-"]').forEach(el => {
        const id = Number((el.getAttribute('data-mark') || '').slice(4));
        const v = (el.textContent || '').trim();
        if (id && v) names[id] = v;
      });
      setSigTexts(names);
    }
    scrollTo(p.sectionId);
  }, [sections, signatories, docTitle, draftRevision]);

  const handleDownload = useCallback(async () => {
    const src = docRef.current;
    if (!src) return;
    setDownloading(true);
    // Clone the document into a clean offscreen stage and capture the clone.
    // This is immune to the modal's live state (scroll position, entrance/sidebar
    // animations) which can otherwise shift or crop the snapshot. UI-only buttons
    // are removed from the clone itself, so its height is measured correctly.
    const stage = document.createElement('div');
    stage.style.cssText = `position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;width:${src.offsetWidth}px;`;
    const clone = src.cloneNode(true) as HTMLElement;
    clone.style.margin = '0';
    clone.style.minHeight = 'auto';
    clone.style.boxShadow = 'none';
    clone.querySelectorAll('[data-ui]').forEach(el => el.remove());
    clone.querySelectorAll('[data-optional-text]').forEach(el => {
      if (!(el.textContent || '').trim()) el.remove();
    });
    clone.querySelectorAll<HTMLElement>('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable');
      el.style.outline = 'none';
      el.removeAttribute('data-empty-label');
    });
    stage.appendChild(clone);
    document.body.appendChild(stage);
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const u = await toPng(clone, { backgroundColor: '#ffffff', pixelRatio: 2, quality: 1 });
      const a = document.createElement('a');
      a.download = `${code}_${new Date().toISOString().slice(0, 10)}.png`;
      a.href = u; a.click();
    } catch (e) {
      console.error('PNG export failed:', e);
      setNotice({ error: true, text: 'Не удалось скачать PNG. Попробуйте ещё раз.' });
    }
    stage.remove();
    setDownloading(false);
  }, [code]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Lock background page scroll while the modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const title = doc?.title || 'НАЗВАНИЕ ДОКУМЕНТА';
  const cyrCode = toCyrillicCode(code);
  const formType = doc?.formType === 'form' ? 'СЛУЖЕБНАЯ ФОРМА' : 'СЛУЖЕБНЫЙ ДОКУМЕНТ УСБ ГИБДД';
  const regType = doc?.regType === 'form' ? 'form' : 'reg';
  const subject = doc?.subject || '';
  const action = doc?.action || '';

  // Render via portal: page containers keep filter/transform from animations,
  // which breaks position: fixed descendants (modal would span the whole page
  // instead of the viewport and open scrolled to the middle).
  return createPortal(
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex overflow-hidden"
        onClick={onClose}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={e => e.stopPropagation()} className="w-full h-full flex relative" role="dialog" aria-modal="true" aria-label="Редактор документа">

          {/* Main */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 px-3 sm:px-6 py-3 border-b border-purple-500/20 bg-[#0a0a12] shrink-0">
              <button onClick={onClose} title="Вернуться к выбору документов"
                className="px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25 text-xs text-purple-300 hover:bg-purple-500/25 hover:text-white transition-all font-mono flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
                Назад
              </button>
              <button onClick={() => setSidebarOpen(!sidebarOpen)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-purple-500/15 text-xs text-gray-400 hover:text-white transition-all font-mono">
                {sidebarOpen ? 'Скрыть панель' : 'Панель'}
              </button>
              {doc && <span className="text-xs font-mono px-2 py-1 rounded bg-purple-500/15 text-purple-300 border border-purple-500/20">{cyrCode}</span>}
              {doc && <span className="text-xs text-gray-500 truncate max-w-[200px] hidden sm:inline">{title}</span>}
              <div className="flex-1" />
                <button onClick={addBookmark} disabled={Boolean(sectionEditor)} title={sectionEditor ? 'Сначала примените текст раздела' : 'Сохранить весь документ в личных копиях'}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-purple-500/15 text-xs text-gray-400 hover:text-white transition-all font-mono flex items-center gap-1.5 disabled:opacity-50">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                  Сохранить копию
                </button>
              <button onClick={handleDownload} disabled={downloading || Boolean(sectionEditor)} title={sectionEditor ? 'Сначала примените текст раздела' : 'Скачать документ в PNG'}
                className="px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-xs text-purple-300 hover:bg-purple-500/30 transition-all font-mono flex items-center gap-1.5 disabled:opacity-50">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {downloading ? '...' : 'Скачать'}
              </button>
              <button onClick={onClose} aria-label="Закрыть редактор"
                className="w-8 h-8 rounded-lg bg-white/5 border border-purple-500/15 flex items-center justify-center text-gray-400 hover:text-white transition-all">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-3 sm:px-6 py-2 text-xs text-slate-300 bg-[#0a0a12] border-b border-sky-300/10">
              Нажмите на любой текст бланка, чтобы изменить его. Для раздела целиком используйте «Изменить текст».
              {sectionEditor && <span className="block mt-1 text-sky-300">Примените текст раздела перед сохранением копии или скачиванием.</span>}
              {notice && <p className={`mt-1 ${notice.error ? 'text-rose-300' : 'text-emerald-300'}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
            </div>

            {/* Document */}
            <div id="doc-scroll" className="flex-1 overflow-y-auto bg-[#111118] p-3 sm:p-6">
              <div ref={docRef} className="bg-white mx-auto max-w-[620px] shadow-2xl" style={{ fontFamily: "'Times New Roman', serif", minHeight: '100%' }}>
                <style>{`.ed,.ed *{color:#000!important}.ed .dim{color:#555!important}.ed [data-placeholder].filled{border-bottom-color:transparent;min-width:0;padding-left:0;padding-right:0;margin-left:0;margin-right:0}.ed [data-doc-text],.ed [data-doc-title],.ed [data-seg]{white-space:pre-wrap;overflow-wrap:anywhere;outline:none}.ed [contenteditable]:focus{outline:2px solid #0284c7;outline-offset:2px;background:#f0f9ff;border-radius:3px}.ed [data-empty-label]:empty:before{content:attr(data-empty-label);color:#64748b;font-style:italic}.ed [data-doc-text]:empty{min-height:1em;min-width:2em;display:inline-block}`}</style>
                <div key={draftRevision} className="ed px-4 sm:px-12 py-10">

                  <div className="flex justify-center mb-3"><img src={import.meta.env.BASE_URL + 'emblem.png'} alt="" className="w-[60px] h-auto" /></div>
                  <p {...editableTextProps('header', 'Шапка документа')} data-optional-text className="text-[11px] leading-tight tracking-[0.1em] uppercase font-semibold text-center border-b border-[#7f7f7f] pb-3">
                    {'ГОСУДАРСТВЕННАЯ ИНСПЕКЦИЯ БЕЗОПАСНОСТИ ДОРОЖНОГО\nДВИЖЕНИЯ МВД РОССИЙСКОГО ОКРУГА'}
                  </p>
                  <p {...editableTextProps('documentType', 'Тип документа')} data-optional-text className="text-[12px] text-center mt-2 font-semibold tracking-[0.08em]">{formType}</p>

                  <div className="text-center mt-6 mb-8">
                    <div contentEditable="plaintext-only" suppressContentEditableWarning data-doc-title role="textbox" aria-label="Название документа" aria-multiline="true"
                      className="text-lg font-bold uppercase tracking-wider outline-none min-w-[200px] inline-block" style={{ color: '#000' }}>{docTitle}</div>
                  </div>

                  <div className="border-t border-b border-[#7f7f7f] py-2 mb-4 flex flex-wrap gap-3 text-[13px]">
                    <span>«<E ph="День" fieldKey="date-day" />» <E ph="Месяц" fieldKey="date-month" /> <span {...editableTextProps('year', 'Год документа')}>2026 г.</span></span>
                    <span><span {...editableTextProps('cityLabel', 'Подпись города')}>г. </span><E ph="Москва" fieldKey="city" /></span>
                    <span className="ml-auto"><span {...editableTextProps('numberLabel', 'Подпись номера')}>№ </span><span className="font-mono"><span {...editableTextProps('codePrefix', 'Код документа')} data-empty-label="Код">{doc ? `${cyrCode}-` : ''}</span><E ph="Номер" fieldKey="number" /></span></span>
                  </div>

                  <div className="flex border border-[#7f7f7f] mb-6">
                    <div className="w-[55%] border-r border-[#7f7f7f] p-2 text-[11px] leading-relaxed">
                      <div {...editableTextProps('organisation', 'Название организации')} className="font-bold">УПРАВЛЕНИЕ СОБСТВЕННОЙ БЕЗОПАСНОСТИ ГИБДД</div>
                      <div {...editableTextProps('address', 'Ведомство и адрес')}>{'ГУ МВД РОССИИ ПО Г. МОСКВЕ И МОСКОВСКОЙ ОБЛАСТИ\nРоссийского Округа, 119021, г. Москва, ул. Остоженка, 53/2'}</div>
                    </div>
                    <div className="w-[45%] text-center p-2 bg-gray-50">
                      <img src={import.meta.env.BASE_URL + 'emblem.png'} alt="" className="w-[22px] h-auto mx-auto mb-1 opacity-80" />
                      <p {...editableTextProps('registrationType', 'Регистрационная надпись')} className="text-[11px] font-bold">{regType === 'form' ? 'СЛУЖЕБНАЯ ФОРМА' : 'ЗАРЕГИСТРИРОВАНО'}</p>
                      <p className="text-[10px] dim"><span {...editableTextProps('registrationNumberLabel', 'Подпись регистрационного номера')}>Рег. № </span><E ph="Регистрационный номер" fieldKey="registration-number" /> <span {...editableTextProps('registrationDateLabel', 'Подпись даты регистрации')}>от </span>«<E ph="Дата регистрации" fieldKey="registration-date" />»</p>
                    </div>
                  </div>

                  <div className="flex gap-4 text-[12px] leading-relaxed mb-4">
                    <div {...editableTextProps('recipient', 'Адресат документа')} data-empty-label="Адресат (можно заполнить)" data-optional-text className="flex-1 min-w-0">{doc?.recipient || ''}</div>
                    <div {...editableTextProps('sender', 'Автор документа')} data-empty-label="Автор (можно заполнить)" data-optional-text className="flex-1 min-w-0 text-right">{doc?.signer || ''}</div>
                  </div>
                    <div className="text-center mb-4" data-optional-text>
                      <p {...editableTextProps('subject', 'Тема документа')} data-empty-label="Тема документа" className="text-[13px] font-bold border-b border-[#b7b7b7] pb-2">{subject}</p>
                    </div>
                    <div className="text-center mb-4" data-optional-text>
                      <p {...editableTextProps('action', 'Вводная надпись документа')} data-empty-label="Вводная надпись" className="text-[13px] font-bold uppercase">{action}</p>
                    </div>

                  {/* Sections */}
                  <div className="space-y-2 mb-8">
                    {sections.map((sec, i) => (
                      <div key={sec.id} id={`sec-${sec.id}`} className="relative group">
                        <div className="flex items-start gap-2 text-[14px] leading-relaxed">
                          <span className="font-bold pt-0.5">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            {(() => {
                              // Section text: editable text segments + [BRACKETED] parts as fillable fields
                              const parts = sec.heading.split(/(\[[^\]]*\])/g);
                              const occurrences: Record<string, number> = {};
                              return parts.map((part, pi) => {
                                if (part.startsWith('[') && part.endsWith(']')) {
                                  const placeholder = part.slice(1, -1) || '___';
                                  const occurrence = occurrences[placeholder] || 0;
                                  occurrences[placeholder] = occurrence + 1;
                                  return <E key={pi} ph={placeholder} fieldKey={`section:${sec.id}:${placeholder}:${occurrence}`} />;
                                }
                                return (
                                  <span key={pi} data-seg contentEditable="plaintext-only" suppressContentEditableWarning role="textbox" aria-label={`Текст раздела ${i + 1}, фрагмент ${pi + 1}`} aria-multiline="true"
                                    className="outline-none focus:bg-gray-100 rounded"
                                  >{part}</span>
                                );
                              });
                            })()}
                          </div>
                            <button onClick={() => removeSection(sec.id)} data-ui
                              className="opacity-50 hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 text-sm font-bold mt-0.5 px-1" title="Удалить секцию">×</button>
                        </div>
                        <div data-ui className="mt-1 mb-3">
                          <button type="button" onClick={() => editSection(sec.id)} className="text-[11px] underline underline-offset-2" aria-label={`Изменить текст раздела ${i + 1} целиком`}>Изменить текст</button>
                          {sectionEditor?.id === sec.id && (
                            <div className="mt-2 rounded-lg border border-sky-500 p-3 bg-sky-50">
                              <label htmlFor={`section-text-${sec.id}`} className="block text-[12px] mb-2">Текст раздела целиком. Поля в квадратных скобках можно добавлять, менять и удалять.</label>
                              <textarea id={`section-text-${sec.id}`} value={sectionEditor.text} onChange={event => setSectionEditor({ id: sec.id, text: event.target.value })} rows={5} className="w-full p-2 text-[13px] bg-white border border-slate-400 rounded resize-y" />
                              <div className="flex gap-3 mt-2 text-[12px]">
                                <button type="button" onClick={applySectionText} className="px-3 py-1 rounded border border-sky-600">Применить текст</button>
                                <button type="button" onClick={() => setSectionEditor(null)} className="px-3 py-1 rounded border border-slate-400">Отмена</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={addSection} data-ui
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-[11px] text-gray-400 hover:border-gray-500 hover:text-gray-600 transition-all mb-8">
                    + Добавить секцию
                  </button>

                  <div className="border-t border-[#8c8c8c] mb-6" />

                  {signatories.map(sig => {
                    const typedName = (sigTexts[sig.id] || '').trim();
                    return (
                    <div key={sig.id} className="flex items-end gap-8 mb-4 group">
                      <div className="flex-1 text-[12px] leading-relaxed">
                        <p><E ph={sig.title} fieldKey={`signatory:${sig.id}:title`} /></p>
                        <E ph={sig.name} fieldKey={`signatory:${sig.id}:name`} mark={`sig-${sig.id}`} onText={v => setSigTexts(t => ({ ...t, [sig.id]: v }))} />
                      </div>
                      <div className="text-[11px] dim text-right">
                        <div>
                          {typedName && !signatureOverrides.includes(sig.id) && <Signature name={typedName} />}
                          <E ph="подпись" fieldKey={`signatory:${sig.id}:signature`} hidden={Boolean(typedName) && !signatureOverrides.includes(sig.id)} />
                        </div>
                        <p><E ph="расшифровка подписи" fieldKey={`signatory:${sig.id}:decoding`} /></p>
                        <button type="button" data-ui onClick={() => setSignatureOverrides(current => current.includes(sig.id) ? current.filter(id => id !== sig.id) : [...current, sig.id])} className="mt-1 text-[11px] underline" aria-label={`Изменить способ подписи ${sig.id}`}>
                          {signatureOverrides.includes(sig.id) ? 'Подпись по имени' : 'Своя подпись'}
                        </button>
                      </div>
                        <button onClick={() => removeSignatory(sig.id)} data-ui
                          className="opacity-50 hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 text-sm font-bold mb-1 px-1" title="Удалить подписанта">×</button>
                    </div>
                    );
                  })}
                  <button onClick={addSignatory} data-ui
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-[11px] text-gray-400 hover:border-gray-500 hover:text-gray-600 transition-all mb-4">
                    + Добавить подписанта
                  </button>
                  <div className="border-t border-[#8c8c8c] pt-4 mt-4">
                    <p {...editableTextProps('footer', 'Нижний колонтитул')} data-optional-text className="text-center text-[9px] dim tracking-wider">СЛУЖЕБНОЕ ИСПОЛЬЗОВАНИЕ · УСБ ГИБДД · СТР.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                className="absolute right-0 top-0 bottom-0 z-10 md:static border-l border-purple-500/20 bg-[#0a0a12] overflow-y-auto shrink-0">
                <div className="w-[260px] p-5">
                  <button type="button" onClick={() => setSidebarOpen(false)} className="text-xs text-sky-300 mb-4" aria-label="Закрыть панель редактора">Скрыть панель ×</button>
                  <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-4">Личные копии <span className="text-[10px] text-gray-600">({cyrCode})</span></h3>
                  {!user && <p className="text-[11px] text-gray-400 mb-3">Копии хранятся в этом браузере. Вход через Discord включает синхронизацию с аккаунтом.</p>}
                  {bookmarks.length === 0 ? (
                    <p className="text-[11px] text-gray-500 italic">Пока нет сохранённых копий</p>
                  ) : (
                    <div className="space-y-1">
                      {bookmarks.map((b, i) => (
                        <div key={i} className="flex items-center justify-between group px-2 py-1.5 rounded-lg hover:bg-white/5">
                          <button onClick={() => applyBookmark(b)} title="Восстановить сохранённый текст"
                            className="text-xs text-gray-400 hover:text-purple-300 transition-colors text-left flex-1">📑 {b.name}</button>
                          <button onClick={() => removeBookmark(i)} aria-label={`Удалить копию ${b.name}`} className="opacity-50 hover:opacity-100 focus:opacity-100 text-red-400 text-xs">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider mt-8 mb-4">Секции</h3>
                  <div className="space-y-1">
                    {sections.map((sec, i) => (
                      <button key={sec.id} onClick={() => scrollTo(sec.id)}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs text-gray-400 hover:text-gray-300 transition-colors">
                        {i + 1}. {sec.heading.slice(0, 30)}{sec.heading.length > 30 ? '...' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
