import { DiscordLogo, MagnifyingGlass, UserCircle } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/useProfile';
import PortalLink from './PortalLink';
import { trustedDiscordAvatar } from '../lib/trustedDiscordAvatar';

interface HeaderProps {
  onToggleSidebar: () => void;
  currentTitle: string;
  onNavigate: (path: string) => void;
  sidebarOpen: boolean;
}
const links = [
  { path: '/', label: 'Главная' }, { path: '/basics', label: 'Курс' },
  { path: '/crafts', label: 'Крафты' }, { path: '/achievements', label: 'Ачивки' },
];
const coursePaths = ['/basics', '/check', '/control', '/discipline', '/practice'];

export default function Header({ onToggleSidebar, currentTitle, onNavigate, sidebarOpen }: HeaderProps) {
  const { user, signInWithDiscord, enabled, loading } = useAuth();
  const { profile } = useProfile();
  const meta = (user?.user_metadata || {}) as Record<string, string | undefined>;
  const avatar = trustedDiscordAvatar(meta.avatar_url);
  const displayName = profile.game_nickname || meta.full_name || meta.name || 'Личный кабинет';
  return <>
    <header className="portal-header liquid-glass">
      <div className="portal-header-brand">
        <PortalLink path="/" onNavigate={onNavigate} className="portal-brand" aria-label="ГИБДД Вики — на главную">
          <img src={import.meta.env.BASE_URL + 'emblem.png'} alt="" width={40} height={40} />
          <span>ГИБДД <span>вики</span></span>
        </PortalLink>
      </div>
      <nav className="portal-top-nav" aria-label="Основные разделы">
        {links.map(link => {
          const active = link.path === currentTitle || link.path === '/basics' && coursePaths.includes(currentTitle);
          return <PortalLink key={link.path} path={link.path} onNavigate={onNavigate} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''}>{link.label}</PortalLink>;
        })}
      </nav>
      <div className="portal-header-actions">
        <button type="button" className="portal-icon-button portal-header-search" onClick={() => window.dispatchEvent(new CustomEvent('open-wiki-search'))} aria-label="Поиск по Вики" title="Поиск по Вики (Ctrl K)"><MagnifyingGlass size={20} aria-hidden="true" /></button>
        {enabled && (loading && !user ? <span className="portal-auth-skeleton" aria-label="Проверяем вход…" role="status" /> : user ?
          <PortalLink path="/profile" onNavigate={onNavigate} className="portal-profile-button" aria-current={currentTitle === '/profile' ? 'page' : undefined} aria-label={'Личный кабинет: ' + displayName}>
            {avatar ? <img src={avatar} alt="" width={28} height={28} /> : <UserCircle size={24} aria-hidden="true" />}
            <span>{displayName}</span>
          </PortalLink> :
          <button type="button" className="portal-login" aria-label="Войти через Discord" onClick={() => signInWithDiscord('/profile')}><DiscordLogo size={18} aria-hidden="true" /><span>Войти</span></button>)}
        <button type="button" onClick={onToggleSidebar} className={'portal-icon-button portal-menu-toggle' + (sidebarOpen ? ' is-open' : '')}
          aria-label={sidebarOpen ? 'Закрыть меню' : 'Все разделы'} aria-expanded={sidebarOpen} aria-controls="site-navigation">
          <span /><span />
        </button>
      </div>
    </header>
  </>;
}
