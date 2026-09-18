import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import { DocConfig } from '../data/docConfigs';

interface DocFormProps { doc: DocConfig | null; onClose: () => void; }

const E = ({ ph, mono }: { ph?: string; mono?: boolean }) => (
  <span contentEditable suppressContentEditableWarning data-placeholder={ph || ''}
    className={`inline-block border-b border-dashed border-gray-500 outline-none focus:border-gray-800 focus:bg-gray-100 rounded px-1 -mx-0.5 min-w-[50px] transition-all ${mono ? 'font-mono' : ''} empty:before:content-[attr(data-placeholder)] empty:before:italic`}
    style={{ color: '#000' }}
  />
);

const addrText = (
  <>
    <span style={{ fontWeight: 600 }}>УПРАВЛЕНИЕ СОБСТВЕННОЙ БЕЗОПАСНОСТИ ГИБДД</span><br />
    ГУ МВД РОССИИ ПО Г. МОСКВЕ И МОСКОВСКОЙ ОБЛАСТИ<br />
    <span style={{ color: '#666' }}>Российского Округа, 119021, г. Москва, ул. Остоженка, 53/2</span>
  </>
);

export default function DocForm({ doc, onClose }: DocFormProps) {
  const docRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const handleDownload = useCallback(async () => {
    if (!docRef.current) return;
    setDownloading(true);
    try {
      const u = await toPng(docRef.current, { backgroundColor: '#ffffff', pixelRatio: 2, quality: 1 });
      const a = document.createElement('a');
      a.download = `${doc?.code || 'doc'}_${new Date().toISOString().slice(0, 10)}.png`;
      a.href = u; a.click();
    } catch { /* empty */ }
    setDownloading(false);
  }, [doc]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (doc) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [doc, onClose]);

  if (!doc) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-[2vh] pb-[5vh] overflow-y-auto"
        onClick={onClose}>
        <motion.div initial={{ opacity: 0, scale: 0.92, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: -20 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={e => e.stopPropagation()} className="w-full max-w-[850px] m-4">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-3 glass rounded-t-2xl border border-purple-500/20 border-b-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">{doc.code}</span>
              <span className="text-sm text-gray-300 font-medium hidden sm:inline">{doc.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleDownload} disabled={downloading}
                className="px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/20 text-xs text-purple-400 hover:bg-purple-500/25 transition-all font-mono flex items-center gap-1.5 disabled:opacity-50">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {downloading ? '...' : 'Скачать PNG'}
              </button>
              <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 border border-purple-500/15 flex items-center justify-center text-gray-400 hover:text-white transition-all">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          {/* DOCUMENT */}
          <style>{`.doc-body,.doc-body *{color:#000!important}.doc-body .dim{color:#555!important}`}</style>
          <div ref={docRef} className="doc-body border border-purple-500/20 border-t-0" style={{ fontFamily: "'Times New Roman', serif", background: '#fff' }}>
            
            {/* Emblem */}
            <div className="flex justify-center pt-10 pb-1"><img src="/emblem.png" alt="" className="w-[68px] h-auto" /></div>

            {/* Header */}
            <div className="px-10 md:px-16 pt-1 pb-4 text-center">
              <p className="text-[10px] leading-tight tracking-[0.1em] uppercase font-semibold border-b border-[#7f7f7f] pb-4">
                ГОСУДАРСТВЕННАЯ ИНСПЕКЦИЯ БЕЗОПАСНОСТИ ДОРОЖНОГО<br/>ДВИЖЕНИЯ МИНИСТЕРСТВА ВНУТРЕННИХ ДЕЛ<br/>РОССИЙСКОГО ОКРУГА
              </p>
            </div>

            <div className="px-10 md:px-16 pb-1 text-center">
              <p className="text-[9px] dim">{doc.formType === 'form' ? 'СЛУЖЕБНАЯ ФОРМА' : 'СЛУЖЕБНЫЙ ДОКУМЕНТ УСБ ГИБДД'}</p>
            </div>

            <div className="px-10 md:px-16 pb-3 text-center">
              <h2 className="text-lg font-bold uppercase tracking-wider" style={{ color: '#000' }}>{doc.title}</h2>
            </div>

            {/* Date / City / Number */}
            <div className="px-10 md:px-16">
              <table className="w-full border-collapse mb-0"><tbody><tr>
                <td className="w-[40%] align-middle py-2 text-[10px] border-b border-[#7f7f7f]">«<E ph="___" />» <E ph="__________" /> 2026 г.</td>
                <td className="w-[30%] align-middle py-2 text-[10px] text-center border-b border-[#7f7f7f]">г. <E ph="Москва" /></td>
                <td className="w-[30%] align-middle py-2 text-[10px] text-right border-b border-[#7f7f7f]">№ <span className="font-mono font-bold">{doc.code.split('-')[0]}-<E ph="____" mono /></span></td>
              </tr></tbody></table>
            </div>

            {/* Address + Registration */}
            <div className="px-10 md:px-16 pt-4 pb-2">
              <table className="w-full border-collapse"><tbody><tr>
                <td className="w-[55%] align-top py-2 border-l-2 border-[#a0a0a0] border-r border-[#7f7f7f] px-3">
                  <p className="text-[8px] leading-relaxed">{addrText}</p>
                </td>
                <td className="w-[45%] align-top py-2 text-center border border-[#7f7f7f] bg-gray-50 px-2">
                  <div className="flex justify-center mb-1"><img src="/emblem.png" alt="" className="w-[26px] h-auto opacity-80" /></div>
                  <p className="text-[9px] font-bold mb-1">{doc.regType === 'form' ? 'СЛУЖЕБНАЯ ФОРМА' : 'ЗАРЕГИСТРИРОВАНО'}</p>
                  <p className="text-[8px] leading-relaxed dim">
                    {doc.regType === 'form'
                      ? <><span>Код формы: {doc.code.split('-')[0]}-<E ph="______" mono /></span><br/><span>Экземпляр № <E ph="______" /></span></>
                      : <><span>Регистрационный № <E ph="____" mono /></span><br/><span>от «<E ph="___" />» <E ph="__________" /> 2026 г.</span></>
                    }
                  </p>
                </td>
              </tr></tbody></table>
            </div>

            {/* Recipient + From */}
            <div className="px-10 md:px-16 pt-4 pb-2">
              <table className="w-full"><tbody><tr>
                <td className="w-[55%] align-top text-[10px] font-bold border-b border-[#7f7f7f] pb-2">
                  <E ph={doc.recipient || 'АДРЕСАТ'} />
                </td>
                <td className="w-[45%] align-top text-right text-[9px] italic leading-relaxed border-b border-[#7f7f7f] pb-2 dim">
                  <E ph={doc.signer || 'оперуполномоченный УСБ ГИБДД, генерал-майор'} />
                </td>
              </tr></tbody></table>
            </div>

            {/* Subject */}
            <div className="px-10 md:px-16 pt-3 pb-2">
              <p className="text-[11px] font-bold text-center border-b border-[#b7b7b7] pb-3">{doc.subject}</p>
            </div>

            {/* Action */}
            <div className="px-10 md:px-16 pt-3 pb-1">
              <p className="text-[11px] font-bold uppercase text-center">{doc.action}</p>
            </div>

            {/* Body */}
            <div className="px-10 md:px-16 pt-2 pb-6">
              <table className="w-full border-collapse"><tbody>
                {doc.body.map((item, i) => (
                  <tr key={i}>
                    <td className="w-[6%] align-top text-[10px] font-bold pt-1">{i + 1}.</td>
                    <td className="text-[10px] leading-relaxed pb-2">{item}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>

            {/* Separator */}
            <div className="px-10 md:px-16"><div className="border-t border-[#8c8c8c] pt-4" /></div>

            {/* Signature */}
            <div className="px-10 md:px-16 pb-12">
              <table className="w-full"><tbody>
                <tr>
                  <td className="w-[40%] text-[9px] leading-relaxed">
                    <p><E ph="Оперуполномоченный УСБ ГИБДД" /></p>
                    <p><E ph="Генерал-майор" /></p>
                    <p className="mt-3"><E ph="______________" /></p>
                    <E ph="Кира Комиссарова" />
                  </td>
                  <td className="w-[30%] text-center text-[9px]">
                    <p className="mt-3"><E ph="______________" /></p>
                    <p className="italic text-[7px] dim">подпись</p>
                  </td>
                  <td className="w-[30%] text-right text-[9px] leading-relaxed">
                    <p>&nbsp;</p><p>&nbsp;</p>
                    <p className="mt-3"><E ph="______________" /></p>
                    <p className="italic text-[7px] dim">расшифровка подписи</p>
                  </td>
                </tr>
                <tr>
                  <td className="text-[8px] pt-2">«<E ph="___" />» <E ph="__________" /> 2026 г.</td>
                  <td className="text-[7px] italic text-center pt-2 dim">подпись</td>
                  <td className="text-[7px] italic text-right pt-2 dim">расшифровка подписи</td>
                </tr>
              </tbody></table>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex justify-between items-center px-5 py-3 glass rounded-b-2xl border border-purple-500/20 border-t-0">
            <span className="text-[10px] text-gray-400 font-mono">Заполняйте поля → Скачать PNG · ESC</span>
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 border border-purple-500/15 text-sm text-gray-400 hover:text-white transition-all font-mono">ESC</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}