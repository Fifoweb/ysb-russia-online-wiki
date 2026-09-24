import { useEffect, useState } from 'react';
import { Menu, Search, UserRound, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import ProfileModal from './ProfileModal';
import { fetchTverskoyOnline } from '../lib/online';

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
  '/reprimand-work': 'Отработка выговора',
  '/restore': 'Восстановление сотрудника',
  '/transfer': 'Переводы в ГИБДД',
  '/resign': 'Заявление на увольнение',
  '/crafts': 'Крафты ГИБДД',
  '/servers': 'Онлайн Тверского',
};

export default function Header({ onToggleSidebar, currentTitle, onNavigate, sidebarOpen }: HeaderProps) {
  const { user, signInWithDiscord, signOut, enabled } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchTverskoyOnline(controller.signal).then(value => setOnline(value.current)).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const meta = (user?.user_metadata || {}) as Record<string, string | undefined>;
  const avatar = meta.avatar_url;
  const displayName = meta.full_name || meta.name || 'Профиль';

  const breadcrumbs = currentTitle === '/' ? [] : [
    { label: 'Главная', path: '/' },
    { label: titles[currentTitle] || '' },
  ];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <button onClick={onToggleSidebar} className="icon-button menu-button" title={sidebarOpen ? 'Закрыть меню' : 'Открыть меню'} aria-label={sidebarOpen ? 'Закрыть меню' : 'Открыть меню'}>{sidebarOpen ? <X size={19} /> : <Menu size={19} />}</button>
        <button className="brand-lockup" onClick={() => onNavigate('/')} aria-label="На главную">
          <span className="brand-white">РОССИЯ</span><span className="brand-red">ОНЛАЙН</span><span className="brand-divider">*</span><span className="brand-unit">ГИБДД</span>
        </button>
        <div className="header-title"><span>ГИБДД Вики</span>{currentTitle !== '/' && titles[currentTitle] && <span className="header-crumb">/ {titles[currentTitle]}</span>}</div>
        <div className="header-actions">
          <button className="online-pill" onClick={() => onNavigate('/servers')} title="Открыть онлайн Тверского"><span className="status-dot" /> <span>{online === null ? 'Тверской' : `${online.toLocaleString('ru-RU')} · Тверской`}</span></button>
          <button className="icon-button" onClick={() => window.dispatchEvent(new CustomEvent('open-wiki-search'))} title="Поиск" aria-label="Поиск"><Search size={18} /></button>

        {enabled && (user ? (
          <button onClick={() => setProfileOpen(true)}
            className="flex items-center gap-2 ml-2 pl-1 pr-3 py-1 rounded-xl bg-white/5 border border-purple-500/20 hover:border-purple-500/40 transition-all"
            title="Личный кабинет">
            {avatar ? (
              <img src={avatar} alt="" className="w-7 h-7 rounded-full" />
            ) : (
            <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-sm"><UserRound size={15} /></span>
            )}
            <span className="text-xs text-gray-200 font-medium max-w-[120px] truncate">{displayName}</span>
          </button>
        ) : (
          <button onClick={() => signInWithDiscord()} className="discord-button">Войти</button>
        ))}
      </div>
      </div>

      {profileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)}
          onSignOut={() => { setProfileOpen(false); signOut(); }} />
      )}
    </header>
  );
}
