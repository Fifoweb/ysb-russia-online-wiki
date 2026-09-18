import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { navItems } from '../data/navigation';
import { searchIndex, SearchEntry } from '../data/search';
import { requestDocOpen } from '../lib/docOpen';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({ currentPath, onNavigate, isOpen, onToggle }: SidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
    if (!searchOpen) { setQuery(''); setResults([]); }
  }, [searchOpen]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
    // Code-friendly matching: "спр 03", "спр-03", "спр03" all match СПР-03
    const normCode = (s: string) => norm(s).replace(/[^a-zа-я0-9]/gi, '');
    const q = norm(query);
    const qc = normCode(query);
    setResults(searchIndex.filter(e =>
      norm(e.title).includes(q) || norm(e.section).includes(q) || norm(e.snippet).includes(q) ||
      (qc.length >= 2 && normCode(e.title).includes(qc))
    ).slice(0, 12));
  }, [query]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <>
      <motion.aside initial={{ x: -280 }} animate={{ x: isOpen ? 0 : -280 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed left-0 top-0 bottom-0 w-[260px] z-40 glass border-r border-purple-500/10 flex flex-col">
        <div className="p-5 border-b border-purple-500/10">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-xl border border-purple-500/30">🛡️</div>
            <div><div className="text-xs text-purple-400 font-mono tracking-wider">РО · ГИБДД</div><div className="text-sm font-bold text-white">УСБ Wiki</div></div>
          </div>
        </div>
        <button onClick={() => setSearchOpen(true)}
          className="mx-4 mt-4 px-4 py-2.5 rounded-xl bg-white/5 border border-purple-500/15 text-sm text-gray-400 hover:border-purple-500/30 hover:text-gray-200 transition-all flex items-center gap-3 text-left">
          <span>🔎</span><span>Поиск по Wiki</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono">Ctrl+K</kbd>
        </button>
        <nav className="flex-1 overflow-y-auto p-3 mt-2 space-y-1">
          {navItems.map(item => (
            <button key={item.id} onClick={() => onNavigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${currentPath === item.path
                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/25'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'}`}>
              <span className="text-lg">{item.icon}</span><span className="font-medium">{item.label}</span>
              {currentPath === item.path && <motion.div layoutId="activeNav" className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400" />}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-purple-500/10">
          <div className="text-[10px] text-gray-600 font-mono tracking-wider text-center">РЕДАКЦИЯ 2.0 · 09.2026</div>
        </div>
      </motion.aside>
      {isOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onToggle} />}
      <AnimatePresence>
        {searchOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
            onClick={() => setSearchOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-xl glass rounded-2xl overflow-hidden border border-purple-500/20 glow-border">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-purple-500/10">
                <span className="text-lg">🔎</span>
                <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Поиск по Wiki..." className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm" />
                <kbd className="text-[10px] px-2 py-1 rounded bg-purple-500/15 text-purple-400 font-mono">ESC</kbd>
              </div>
              <div className="max-h-[50vh] overflow-y-auto">
                  {results.length > 0 ? results.map(r => (
                    <button key={r.id}
                      onClick={() => {
                        onNavigate(r.path);
                        if (r.docCode) requestDocOpen(r.docCode);
                        setSearchOpen(false);
                      }}
                      className="w-full text-left px-5 py-3.5 hover:bg-purple-500/10 border-b border-purple-500/5 transition-all">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-gray-200">{r.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono">{r.section}</span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-1">{r.snippet}</p>
                    </button>
                  )) : query.length >= 2 ? (
                  <div className="px-5 py-8 text-center text-gray-500 text-sm">Ничего не найдено</div>
                ) : (
                  <div className="px-5 py-8 text-center text-gray-500 text-sm">Введите название раздела или ключевые слова...</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}