import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight, ArrowsLeftRight, BookOpenText, ClipboardText, FileText, GraduationCap,
  House, MagnifyingGlass, Scales, Shield, Toolbox, Trophy, UserCheck, UserCircle, UsersThree, WifiHigh, X,
  type Icon,
} from '@phosphor-icons/react';
import { navItems } from '../data/navigation';
import type { SearchEntry } from '../data/search';
import { requestDocOpen } from '../lib/docOpen';
import PortalDialog from './PortalDialog';
import PortalLink from './PortalLink';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}
const itemIcons: Record<string, Icon> = {
  home: House, profile: UserCircle, crafts: Toolbox, servers: WifiHigh, achievements: Trophy,
  basics: Shield, check: MagnifyingGlass, control: ClipboardText, discipline: Scales,
  practice: GraduationCap, appendix: FileText, handbook: BookOpenText, transfer: ArrowsLeftRight,
  restore: UserCheck, department: UsersThree,
};

export default function Sidebar({ currentPath, onNavigate, isOpen, onToggle }: SidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState<SearchEntry[] | null>(null);
  const [searchError, setSearchError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const openSearch = useCallback(() => {
    if (isOpen) onToggle();
    setSearchOpen(true);
  }, [isOpen, onToggle]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('open-wiki-search', openSearch);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('open-wiki-search', openSearch);
    };
  }, [openSearch]);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus({ preventScroll: true });
    else setQuery('');
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || searchIndex) return;
    let cancelled = false;
    setSearchError(false);
    void import('../data/search').then(module => {
      if (!cancelled) setSearchIndex(module.searchIndex);
    }).catch(() => { if (!cancelled) setSearchError(true); });
    return () => { cancelled = true; };
  }, [searchOpen, searchIndex]);

  const normalize = (value: string) => value.toLowerCase().replace(/ё/g, 'е');
  const code = (value: string) => normalize(value).replace(/[^a-zа-я0-9]/gi, '');
  const q = normalize(query.trim());
  const results = q.length < 2 ? [] : (searchIndex ?? []).filter(entry =>
    normalize(entry.title).includes(q) || normalize(entry.section).includes(q) ||
    normalize(entry.snippet).includes(q) || (code(q).length >= 2 && code(entry.title).includes(code(q)))
  ).slice(0, 12);

  return <>
    <PortalDialog id="site-navigation" open={isOpen} onClose={onToggle} label="Все разделы Вики" className="portal-navigation-dialog">
      <div className="portal-dialog-surface">
        <div className="portal-dialog-heading"><div><p>ГИБДД Вики</p><h2>Куда отправимся?</h2></div><button type="button" onClick={onToggle} className="portal-icon-button" aria-label="Закрыть меню"><X size={22} aria-hidden="true" /></button></div>
        <button type="button" className="portal-menu-search" onClick={openSearch}><MagnifyingGlass size={22} aria-hidden="true" /><span>Найти материал или документ</span><kbd>Ctrl K</kbd></button>
        <nav className="portal-menu-groups" aria-label="Все разделы">
          {['Обзор', 'Каталоги', 'Курс', 'Заявки'].map((section, sectionIndex) =>
            <section className={'portal-menu-group ' + (section === 'Заявки' ? 'portal-menu-applications' : '')} key={section}>
              <h3>{section}</h3>
              {navItems.filter(item => item.section === section).map((item, index) => {
                const ItemIcon = itemIcons[item.id] || FileText;
                return <motion.div key={item.id} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : sectionIndex * 0.05 + index * 0.025, ease: [0.32, 0.72, 0, 1] }}>
                  <PortalLink path={item.path} onNavigate={path => { onNavigate(path); onToggle(); }}
                    className={'portal-menu-link' + (currentPath === item.path ? ' active' : '')} aria-current={currentPath === item.path ? 'page' : undefined}>
                    <ItemIcon size={20} weight="duotone" aria-hidden="true" /><span>{item.label}</span><ArrowUpRight size={16} aria-hidden="true" />
                  </PortalLink>
                </motion.div>;
              })}
            </section>
          )}
        </nav>
        <p className="portal-menu-foot">Знания и инструменты для каждой смены.</p>
      </div>
    </PortalDialog>

    <PortalDialog open={searchOpen} onClose={() => setSearchOpen(false)} label="Поиск по Вики" className="portal-search-dialog">
      <div className="portal-dialog-surface">
        <div className="portal-search-input-row">
          <MagnifyingGlass size={24} aria-hidden="true" />
          <label htmlFor="portal-search-input" className="sr-only">Название раздела или документа</label>
          <input ref={inputRef} id="portal-search-input" name="wiki-query" type="search" value={query}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setSearchOpen(false);
              }
            }}
            onChange={event => setQuery(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Раздел, статья или код документа…" />
          <button type="button" className="portal-icon-button" onClick={() => setSearchOpen(false)} aria-label="Закрыть поиск"><X size={20} aria-hidden="true" /></button>
        </div>
        <p className="portal-search-status" aria-live="polite">{searchError ? 'Не удалось загрузить поиск. Закройте окно и попробуйте снова.' : !searchIndex ? 'Загружаем материалы…' : q.length < 2 ? 'Быстрый доступ к материалам' : 'Результатов: ' + results.length}</p>
        {results.length ? <nav className="portal-search-results" aria-label="Результаты поиска">
          {results.map(result => <PortalLink key={result.id} path={result.path} onNavigate={path => {
            onNavigate(path);
            if (result.docCode) requestDocOpen(result.docCode);
            setSearchOpen(false);
          }} className="portal-search-result"><div><span>{result.section}</span><strong>{result.title}</strong><p>{result.snippet}</p></div><ArrowUpRight size={20} aria-hidden="true" /></PortalLink>)}
        </nav> : <div className="portal-search-empty">
          <BookOpenText size={36} weight="duotone" aria-hidden="true" />
          <h3>{q.length >= 2 ? 'Пока ничего не нашли' : 'Что хотите узнать?'}</h3>
          <p>{q.length >= 2 ? 'Попробуйте другое название или код документа.' : 'Введите хотя бы две буквы. Можно искать по коду, например СПР 03.'}</p>
          <div className="portal-search-suggestions">{['Повышение', 'Проверка', 'Памятка'].map(value => <button type="button" key={value} onClick={() => setQuery(value)}>{value}</button>)}</div>
        </div>}
        <div className="portal-search-foot"><span><kbd>Tab</kbd> выбрать результат</span><span><kbd>Esc</kbd> закрыть</span></div>
      </div>
    </PortalDialog>
  </>;
}
