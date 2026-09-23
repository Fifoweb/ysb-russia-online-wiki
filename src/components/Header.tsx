import { useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useAuth } from '../lib/auth';
import ProfileModal from './ProfileModal';

interface HeaderProps {
  onToggleSidebar: () => void;
  currentTitle: string;
  onNavigate: (path: string) => void;
  sidebarOpen: boolean;
}

const titles: Record<string, string> = {
  '/': 'Главная', '/basics': 'Основа службы', '/check': 'Служебная проверка',
  '/control': 'Повседневный контроль', '/discipline': 'Дисциплина и решения',
  '/practice': 'Практика и зачёт', '/appendix': 'Приложения и формы',
  '/handbook': 'Памятка Россия Онлайн',
  '/report': 'Заявление на повышение',
  '/appeal': 'Обжалование выговора',
  '/restore': 'Восстановление сотрудника',
  '/transfer': 'Переводы в ГИБДД',
  '/resign': 'Заявление на увольнение',
};

export default function Header({ onToggleSidebar, currentTitle, onNavigate, sidebarOpen }: HeaderProps) {
  const { scrollY } = useScroll();
  const headerBg = useTransform(scrollY, [0, 100], ['rgba(5,5,8,0)', 'rgba(5,5,8,0.85)']);
  const { user, signInWithDiscord, signOut, enabled } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const meta = (user?.user_metadata || {}) as Record<string, string | undefined>;
  const avatar = meta.avatar_url;
  const displayName = meta.full_name || meta.name || 'Профиль';

  const breadcrumbs = currentTitle === '/' ? [] : [
    { label: 'Главная', path: '/' },
    { label: titles[currentTitle] || '' },
  ];

  return (
    <motion.header style={{ background: headerBg }}
      className={`fixed top-0 right-0 left-0 ${sidebarOpen ? 'lg:left-[260px]' : 'lg:left-0'} transition-[left] duration-300 z-30 h-16 backdrop-blur-xl border-b border-purple-500/10 flex items-center px-4 lg:px-8`}>
      <button onClick={onToggleSidebar}
        className="w-10 h-10 rounded-xl bg-white/5 border border-purple-500/15 flex items-center justify-center text-gray-400 hover:text-white hover:border-purple-500/30 transition-all mr-3"
        title={sidebarOpen ? 'Скрыть меню' : 'Показать меню'}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={() => window.history.back()}
          className="hidden sm:flex w-8 h-8 rounded-lg bg-white/5 border border-purple-500/10 items-center justify-center text-gray-400 hover:text-white hover:border-purple-500/30 transition-all"
          title="Назад"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => window.history.forward()}
          className="hidden sm:flex w-8 h-8 rounded-lg bg-white/5 border border-purple-500/10 items-center justify-center text-gray-400 hover:text-white hover:border-purple-500/30 transition-all"
          title="Вперёд"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2 ml-2">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-600 text-xs">/</span>}
            {crumb.path ? (
              <button onClick={() => onNavigate(crumb.path)}
                className="text-xs text-gray-500 font-mono hover:text-purple-400 transition-colors">
                {crumb.label}
              </button>
            ) : (
              <span className="text-xs font-semibold text-purple-300">{crumb.label}</span>
            )}
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.5)]" />
        <span className="text-xs text-gray-500 font-mono">ONLINE</span>
        <div className="hidden sm:flex items-center gap-2 ml-4 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/15">
          <span className="text-xs text-purple-400 font-mono">РОССИЯ ОНЛАЙН</span>
        </div>

        {enabled && (user ? (
          <button onClick={() => setProfileOpen(true)}
            className="flex items-center gap-2 ml-2 pl-1 pr-3 py-1 rounded-xl bg-white/5 border border-purple-500/20 hover:border-purple-500/40 transition-all"
            title="Личный кабинет">
            {avatar ? (
              <img src={avatar} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-sm">👤</span>
            )}
            <span className="text-xs text-gray-200 font-medium max-w-[120px] truncate">{displayName}</span>
          </button>
        ) : (
          <button onClick={signInWithDiscord}
            className="flex items-center gap-2 ml-2 px-3 py-1.5 rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#8b9aff] hover:bg-[#5865F2]/25 hover:text-white transition-all text-xs font-medium">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 00-4.93-1.51 13.78 13.78 0 00-.64 1.28 18.27 18.27 0 00-5.5 0 13.78 13.78 0 00-.64-1.28h-.05A19.82 19.82 0 003.64 4.37 19.07 19.07 0 00.11 18.06a19.9 19.9 0 006.04 3.03c.46-.66.86-1.36 1.25-2.09a12.9 12.9 0 01-1.96-.94c.16-.12.32-.24.47-.37a14.2 14.2 0 0012.18 0c.15.13.31.25.47.37-.62.37-1.28.69-1.96.94.39.73.79 1.43 1.25 2.09a19.84 19.84 0 006.04-3.03 19.03 19.03 0 00-3.53-13.69zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42s.95-2.42 2.15-2.42c1.22 0 2.18 1.1 2.16 2.42 0 1.34-.94 2.42-2.16 2.42z"/></svg>
            Войти через Discord
          </button>
        ))}
      </div>

      {profileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)}
          onSignOut={() => { setProfileOpen(false); signOut(); }} />
      )}
    </motion.header>
  );
}
