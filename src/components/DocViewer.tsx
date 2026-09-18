import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import { DocTemplate } from '../data/documents';

interface DocViewerProps {
  doc: DocTemplate | null;
  onClose: () => void;
}

function Emblem() {
  return (
    <svg width="64" height="78" viewBox="0 0 64 78" fill="none">
      <path d="M32 2L4 20v16c0 20 28 40 28 40s28-20 28-40V20L32 2z" fill="#a855f7" stroke="#c084fc" strokeWidth="1.2" opacity="0.75"/>
      <path d="M32 56s24-16 24-38V22L32 6 8 22v-4c0 22 24 38 24 38z" fill="#7c3aed" stroke="#a855f7" strokeWidth="0.6" opacity="0.5"/>
      <circle cx="32" cy="32" r="10" fill="#c084fc" opacity="0.3"/>
      <path d="M28 32l-4-4m8 4l4-4m-4 4l-6 6m6-6l6 6" stroke="#c084fc" strokeWidth="1.2" opacity="0.6" strokeLinecap="round"/>
      <circle cx="32" cy="32" r="3" fill="#e9d5ff" opacity="0.4"/>
    </svg>
  );
}

function EditableField({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]*\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          const placeholder = part.slice(1, -1);
          return (
            <span
              key={i}
              contentEditable
              suppressContentEditableWarning
              data-placeholder={placeholder}
              className="inline-block min-w-[60px] border-b border-dashed border-purple-500/40 text-purple-300/90 outline-none focus:border-purple-400 focus:bg-purple-500/10 rounded px-1 -mx-0.5 transition-all empty:before:content-[attr(data-placeholder)] empty:before:text-gray-600 empty:before:italic"
              spellCheck={false}
            />
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const docSubjects: Record<string, string> = {
  'КР-01': 'О регистрации обращения / жалобы',
  'УВ-01': 'О принятии обращения к рассмотрению',
  'УВ-02': 'О направлении материала по подведомственности',
  'ОТВ-01': 'О результатах рассмотрения жалобы',
  'ОТВ-02': 'О предоставлении сведений по запросу',
  'СП-01': 'О направлении материалов',
  'РП-01': 'О выявлении возможного нарушения',
  'РП-02': 'О начале служебной проверки',
  'РП-03': 'О результатах служебной проверки',
  'РП-04': 'О передаче материалов по подведомственности',
  'СПР-01': 'О плане служебной проверки',
  'ТР-02': 'О предоставлении документов и материалов',
  'ТР-03': 'О предоставлении письменного объяснения',
  'ОБ-01': 'О предоставлении объяснения',
  'АКТ-01': 'О отказе от письменного объяснения',
  'АКТ-02': 'О неисполнении служебного требования УСБ',
  'АКТ-03': 'О просмотре видеозаписи',
  'АКТ-04': 'О проверке служебного транспорта',
  'АКТ-05': 'О проверке документов сотрудника',
  'АКТ-06': 'О личном обыске сотрудника',
  'АКТ-07': 'О проверке на состояние опьянения',
  'ЗКЛ-01': 'О результатах служебной проверки',
  'СЗ-01': 'О служебном вопросе',
  'ЗП-01': 'О предоставлении сведений и материалов',
  'ТР-01': 'О исполнении служебного требования УСБ',
  'ПРЧ-01': 'О проведении служебного мероприятия',
  'ПРК-01': 'О организации работы УСБ',
  'ПРД-01': 'Об устранении нарушений',
  'ПРД-02': 'О применении дисциплинарного взыскания',
  'УВ-03': 'О применённом дисциплинарном взыскании',
  'РД-01': 'О реестре доказательств',
  'ОП-01': 'Об описи материалов проверки',
};

const docActions: Record<string, string> = {
  'КР-01': 'КАРТОЧКА УЧЕТА',
  'УВ-01': 'УВЕДОМЛЯЮ:', 'УВ-02': 'УВЕДОМЛЯЮ:', 'УВ-03': 'УВЕДОМЛЯЮ:',
  'ОТВ-01': 'СООБЩАЮ:', 'ОТВ-02': 'СООБЩАЮ:', 'СП-01': 'НАПРАВЛЯЮ',
  'РП-01': 'ДОКЛАДЫВАЮ:', 'РП-02': 'ДОКЛАДЫВАЮ:', 'РП-03': 'ДОКЛАДЫВАЮ:', 'РП-04': 'ДОКЛАДЫВАЮ:',
  'СПР-01': 'ПЛАН ПРОВЕРКИ', 'ТР-02': 'ТРЕБУЮ ПРЕДОСТАВИТЬ',
  'ТР-03': 'ПРЕДЛАГАЮ ПРЕДОСТАВИТЬ ОБЪЯСНЕНИЕ', 'ОБ-01': 'ОБЪЯСНЯЮ:',
  'АКТ-01': 'УСТАНОВЛЕНО', 'АКТ-02': 'УСТАНОВЛЕНО',
  'АКТ-03': 'ПРОСМОТРОМ УСТАНОВЛЕНО', 'АКТ-04': 'ПРОВЕРКОЙ УСТАНОВЛЕНО',
  'АКТ-05': 'ПРОВЕРКОЙ УСТАНОВЛЕНО', 'АКТ-06': 'УСТАНОВЛЕНО', 'АКТ-07': 'УСТАНОВЛЕНО',
  'ТР-01': 'ТРЕБУЮ', 'ПРЧ-01': 'ПОРУЧАЮ:', 'ПРК-01': 'ПРИКАЗЫВАЮ:',
  'ПРД-01': 'ПРЕДЛАГАЮ:', 'ПРД-02': 'ПРЕДСТАВЛЯЮ:', 'СЗ-01': 'СООБЩАЮ:',
  'ЗП-01': 'ПРОШУ ПРЕДОСТАВИТЬ', 'ЗКЛ-01': 'УСТАНОВЛЕНО:',
  'РД-01': 'РЕЕСТР ДОКАЗАТЕЛЬСТВ', 'ОП-01': 'ОПИСЬ МАТЕРИАЛОВ',
};

function getRecipient(code: string) {
  if (code === 'КР-01') return 'В ДЕЛО';
  if (['РП-01','РП-02','РП-03','РП-04'].includes(code)) return <><span className="text-gray-300">Начальнику УСБ ГИБДД</span><br/><EditableField text="[ФИО]" /></>;
  if (['УВ-01','УВ-02','ОТВ-01'].includes(code)) return <EditableField text="[ФИО ЗАЯВИТЕЛЯ]" />;
  if (['ОТВ-02','СП-01'].includes(code)) return <EditableField text="[ОРГАН / ДОЛЖНОСТНОЕ ЛИЦО]" />;
  if (code === 'СЗ-01') return <EditableField text="[РУКОВОДИТЕЛЮ]" />;
  if (code === 'ЗП-01') return <EditableField text="[ПОДРАЗДЕЛЕНИЕ / ДОЛЖНОСТНОЕ ЛИЦО]" />;
  if (['ТР-01','ТР-02','ТР-03'].includes(code)) return <EditableField text="[ФИО, ЗВАНИЕ, ДОЛЖНОСТЬ]" />;
  if (code === 'ОБ-01') return 'В УСБ ГИБДД';
  if (code === 'ПРЧ-01') return <EditableField text="[ИСПОЛНИТЕЛЯМ]" />;
  if (code === 'ПРК-01') return 'Сотрудникам УСБ ГИБДД';
  if (['ПРД-01','ПРД-02'].includes(code)) return <EditableField text="[ДОЛЖНОСТНОЕ ЛИЦО]" />;
  if (code === 'УВ-03') return <EditableField text="[ФИО СОТРУДНИКА]" />;
  if (code === 'РШ-02') return <EditableField text="[ФИО ЗАЯВИТЕЛЯ]" />;
  return 'В МАТЕРИАЛ СЛУЖЕБНОЙ ПРОВЕРКИ';
}

export default function DocViewer({ doc, onClose }: DocViewerProps) {
  const docRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!docRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(docRef.current, {
        backgroundColor: '#0d0d1a',
        pixelRatio: 2,
        quality: 1,
      });
      const link = document.createElement('a');
      link.download = `${doc?.code || 'document'}_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    }
    setDownloading(false);
  }, [doc]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <AnimatePresence>
      {doc && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-[2vh] pb-[5vh] overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[850px] m-4"
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 glass rounded-t-2xl border border-purple-500/20 border-b-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">{doc.code}</span>
                <span className="text-sm text-gray-300 font-medium hidden sm:inline">{doc.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleDownload} disabled={downloading}
                  className="px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/20 text-xs text-purple-400 hover:bg-purple-500/25 transition-all font-mono flex items-center gap-1.5 disabled:opacity-50">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {downloading ? '...' : 'Скачать PNG'}
                </button>
                <button onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-purple-500/15 flex items-center justify-center text-gray-400 hover:text-white transition-all">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            {/* Document body */}
            <div ref={docRef} className="bg-[#0d0d1a] shadow-2xl border border-purple-500/20 border-t-0">
              
              {/* Emblem + header */}
              <div className="px-8 md:px-14 pt-10 pb-3">
                <div className="flex justify-center mb-4"><Emblem /></div>
                <p className="text-[10px] leading-tight tracking-[0.12em] uppercase text-center text-purple-300/70 font-semibold">
                  ГОСУДАРСТВЕННАЯ ИНСПЕКЦИЯ БЕЗОПАСНОСТИ ДОРОЖНОГО<br/>
                  ДВИЖЕНИЯ МИНИСТЕРСТВА ВНУТРЕННИХ ДЕЛ<br/>
                  РОССИЙСКОГО ОКРУГА
                </p>
              </div>

              <div className="px-8 md:px-14"><div className="border-t border-purple-500/20" /></div>

              <div className="px-8 md:px-14 pt-5 pb-2">
                <p className="text-[10px] text-center tracking-[0.08em] uppercase text-purple-400/60 font-semibold mb-1">
                  СЛУЖЕБНЫЙ ДОКУМЕНТ УСБ ГИБДД
                </p>
                <h2 className="text-base md:text-lg text-center font-bold uppercase text-gray-200 mb-4 tracking-wide">{doc.title}</h2>
              </div>

              <div className="px-8 md:px-14">
                <div className="flex items-center gap-4 text-[11px] text-gray-400 border-b border-purple-500/10 pb-3">
                  <span>«<EditableField text="[ДАТА]" />» <EditableField text="[МЕСЯЦ]" /> 2026 г.</span>
                  <span className="ml-auto">г. <EditableField text="[ГОРОД]" /></span>
                  <span className="ml-auto font-mono text-[10px] text-purple-400">№ {doc.code}<EditableField text="[НОМЕР]" /></span>
                </div>
              </div>

              <div className="px-8 md:px-14 pt-4 pb-1">
                <div className="grid grid-cols-[1fr_auto] gap-6">
                  <p className="text-[8px] leading-relaxed text-gray-600">
                    УПРАВЛЕНИЕ СОБСТВЕННОЙ БЕЗОПАСНОСТИ ГИБДД<br />
                    ГУ МВД РОССИИ ПО Г. МОСКВЕ И МОСКОВСКОЙ ОБЛАСТИ<br />
                    Российского Округа, 119021, г. Москва, ул. Остоженка, 53/2
                  </p>
                  <div className="border border-purple-500/30 px-3 py-2 text-[9px] leading-tight text-right">
                    {['КР-01', 'СПР-01'].includes(doc.code) ? (
                      <>
                        <p className="font-bold text-purple-300/80 mb-1">СЛУЖЕБНАЯ ФОРМА</p>
                        <p className="text-gray-500">Код: {doc.code}<EditableField text="[ЭКЗ]" /></p>
                        <p className="text-gray-500">Экз. № <EditableField text="[___]" /></p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-purple-300/80 mb-1">ЗАРЕГИСТРИРОВАНО</p>
                        <p className="text-gray-500">Рег. № <EditableField text="[НОМЕР]" /></p>
                        <p className="text-gray-500">от «<EditableField text="[ДАТА]" />»</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-8 md:px-14 pt-5 pb-2">
                <div className="flex justify-between items-start text-[11px]">
                  <div className="text-gray-300 font-semibold max-w-[55%] leading-relaxed">
                    {getRecipient(doc.code)}
                  </div>
                  <div className="text-right text-gray-500 italic text-[10px] max-w-[40%] leading-relaxed">
                    {doc.code.startsWith('РП') ? <>от оперуполномоченного УСБ ГИБДД,<br/>генерал-майора<br/><EditableField text="[ФАМИЛИЯ]" /></> :
                     doc.code === 'ОБ-01' ? <>от <EditableField text="[ФИО, ЗВАНИЕ, ДОЛЖНОСТЬ]" /></> :
                     doc.code === 'ПРЧ-01' ? <>от <EditableField text="[ДОЛЖНОСТЬ, ФИО РУКОВОДИТЕЛЯ]" /></> :
                     doc.code === 'ПРК-01' ? <>от Начальника УСБ ГИБДД<br/><EditableField text="[ФИО]" /></> :
                     <>от оперуполномоченного УСБ ГИБДД,<br/>генерал-майора<br/><EditableField text="[ФАМИЛИЯ]" /></>}
                  </div>
                </div>
              </div>

              <div className="px-8 md:px-14 pt-3 pb-1">
                <p className="text-[11px] font-bold text-purple-300/80 text-center border-b border-purple-500/10 pb-2 italic">
                  {docSubjects[doc.code] || 'О служебном вопросе'}
                </p>
              </div>

              <div className="px-8 md:px-14 pt-3 pb-1">
                <p className="text-[11px] font-bold text-purple-400/80 uppercase tracking-wider text-center">
                  {docActions[doc.code] || 'ДОКЛАДЫВАЮ:'}
                </p>
              </div>

              <div className="px-8 md:px-14 pt-4 pb-6">
                <div className="space-y-2.5">
                  {doc.fields.map((field, i) => (
                    <div key={i} className="text-[11px] leading-relaxed text-gray-300/90">
                      <span className="font-bold text-purple-400/70 mr-2">{i + 1}.</span>
                      <EditableField text={field} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-8 md:px-14 pb-10 pt-2">
                <div className="flex justify-between items-end text-[10px]">
                  <div className="text-gray-500 leading-relaxed">
                    <p>{doc.code === 'ОБ-01' ? 'Сотрудник' : doc.code === 'ПРЧ-01' ? <EditableField text="[ДОЛЖНОСТЬ]" /> : doc.code === 'ПРК-01' ? 'Начальник УСБ ГИБДД' : 'Оперуполномоченный УСБ ГИБДД'}</p>
                    <p>{doc.code === 'ОБ-01' ? <EditableField text="[ЗВАНИЕ]" /> : 'Генерал-майор'}</p>
                    <p className="mt-3">______________</p>
                    <p>{doc.code === 'ПРК-01' || doc.code === 'ОБ-01' ? <EditableField text="[ФИО]" /> : <EditableField text="[ФАМИЛИЯ И.О.]" />}</p>
                  </div>
                  <div className="text-gray-600 text-right leading-relaxed">
                    <p>подпись</p>
                    <p>расшифровка</p>
                    <p className="mt-3">«<EditableField text="[ДАТА]" />»</p>
                  </div>
                </div>
              </div>

              <div className="px-8 md:px-14 pb-6">
                <div className="border-t border-purple-500/15" />
                <p className="text-center text-[8px] text-gray-700 mt-2 tracking-wider">СЛУЖЕБНОЕ ИСПОЛЬЗОВАНИЕ · УСБ ГИБДД · СТР.</p>
              </div>
            </div>

            {/* Bottom toolbar */}
            <div className="flex justify-between items-center px-5 py-3 glass rounded-b-2xl border border-purple-500/20 border-t-0 rounded-t-none">
              <span className="text-[10px] text-gray-600 font-mono">Заполните поля [в скобках] → Скачать PNG · ESC — закрыть</span>
              <div className="flex items-center gap-2">
                <button onClick={handleDownload} disabled={downloading}
                  className="px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-sm text-purple-300 hover:bg-purple-500/30 transition-all font-mono flex items-center gap-1.5 disabled:opacity-50">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {downloading ? 'Сохранение...' : 'Скачать PNG'}
                </button>
                <button onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white/5 border border-purple-500/15 text-sm text-gray-400 hover:text-white transition-all font-mono">ESC</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}