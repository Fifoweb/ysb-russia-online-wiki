import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightLeft, ArrowUpRight, BookOpen, Boxes, Eye, FileText, Gavel,
  GraduationCap, Hammer, Home, LogOut, MessageSquare, RotateCcw, Search,
  Server, Shield, TrendingUp, UserCheck, UsersRound, Wrench, X, type LucideIcon,
} from 'lucide-react';
import { navItems } from '../data/navigation';
import { searchIndex, SearchEntry } from '../data/search';
import { requestDocOpen } from '../lib/docOpen';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const itemIcons: Record<string, LucideIcon> = {
  home: Home, crafts: Wrench, servers: Server, basics: Shield,
  check: Search, control: Eye, discipline: Gavel, practice: GraduationCap,
  appendix: FileText, handbook: BookOpen, report: ArrowUpRight,
  promotion: TrendingUp, appeal: RotateCcw, 'reprimand-work': Hammer,
  restore: UserCheck, transfer: ArrowRightLeft, department: UsersRound, resign: LogOut,
  complaints: MessageSquare,
};

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

  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener('open-wiki-search', open);
    return () => window.removeEventListener('open-wiki-search', open);
  }, []);

  const sectionIcons = { Обзор: Home, Каталоги: Boxes, Курс: BookOpen, Заявки: FileText };

  return (
    <>
      <motion.aside id="site-navigation" initial={{ x: -320 }} animate={{ x: isOpen ? 0 : -320 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="wiki-drawer">
        <div className="drawer-heading"><div><p className="eyebrow">НАВИГАЦИЯ</p><h2>ГИБДД Вики</h2></div><button className="icon-button" onClick={onToggle} title="Закрыть меню" aria-label="Закрыть меню"><X size={18} /></button></div>
        <button onClick={() => setSearchOpen(true)}
          className="drawer-search"><Search size={17} /><span>Поиск по Wiki</span><kbd>Ctrl K</kbd>
        </button>
        <nav className="drawer-nav">
          {['Обзор', 'Каталоги', 'Курс', 'Заявки'].map(section => {
            const SectionIcon = sectionIcons[section as keyof typeof sectionIcons];
            return (
              <div className="drawer-section" key={section}>
                <div className="drawer-section-title"><SectionIcon size={14} /> {section}</div>
                {navItems.filter(item => item.section === section).map(item => {
                  const ItemIcon = itemIcons[item.id] || FileText;
                  return (
                    <button key={item.id} onClick={() => { onNavigate(item.path); onToggle(); }}
                      className={`drawer-link ${currentPath === item.path ? 'active' : ''}`}
                      aria-current={currentPath === item.path ? 'page' : undefined}>
                      <span className="drawer-icon"><ItemIcon size={17} strokeWidth={1.8} /></span>
                      <span>{item.label}</span>
                      {currentPath === item.path && <motion.span layoutId="activeNav" className="drawer-active" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="drawer-foot">Редакция 2.0 · ГИБДД Россия Онлайн</div>
      </motion.aside>
      {isOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onToggle} />}
      <AnimatePresence>
        {searchOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
            onClick={() => setSearchOpen(false)} role="dialog" aria-modal="true" aria-label="Поиск по Wiki">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-xl glass rounded-2xl overflow-hidden border border-purple-500/20 glow-border">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-purple-500/10">
                <Search size={18} className="text-blue-300" aria-hidden="true" />
                <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Поиск по Wiki..." aria-label="Поисковый запрос" className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm" />
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
