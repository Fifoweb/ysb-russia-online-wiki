import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { DiscordLogo, SignOut, UserCircle, X } from '@phosphor-icons/react';
import { emptyProfile, loadProfile, saveProfile, type Profile } from '../lib/db';
import { trustedDiscordAvatar } from '../lib/trustedDiscordAvatar';
import PortalDialog from './PortalDialog';

interface ProfileModalProps { user: User; onClose: () => void; onSignOut: () => void; }

export default function ProfileModal({ user, onClose, onSignOut }: ProfileModalProps) {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const meta = (user.user_metadata || {}) as Record<string, string | undefined>;
  const avatar = trustedDiscordAvatar(meta.avatar_url);
  const name = meta.full_name || meta.name || 'Пользователь';
  useEffect(() => {
    let cancelled = false;
    setProfile(emptyProfile);
    setLoading(true);
    loadProfile(user.id).then(value => { if (!cancelled) setProfile(value); })
      .catch(() => { if (!cancelled) setError('Не удалось загрузить профиль. Закройте окно и попробуйте ещё раз.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.id]);
  const change = (key: keyof Profile, value: string) => { setProfile(current => ({ ...current, [key]: value })); setSaved(false); setError(''); };
  const save = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      if (!await saveProfile(user.id, profile)) throw new Error();
      setSaved(true);
    } catch { setError('Не удалось сохранить профиль. Проверьте соединение и попробуйте снова.'); }
    finally { setSaving(false); }
  };
  const field = (label: string, key: keyof Profile, placeholder: string) =>
    <label><span>{label}</span><input name={key} autoComplete="off" value={profile[key]} placeholder={placeholder} onChange={event => change(key, event.target.value)} /></label>;

  return <PortalDialog open onClose={onClose} label="Личный кабинет" className="portal-profile-dialog">
    <div className="portal-dialog-surface">
      <div className="portal-dialog-heading"><div><p>Личный кабинет</p><h2>Ваш профиль</h2></div><button type="button" className="portal-icon-button" onClick={onClose} aria-label="Закрыть личный кабинет"><X size={20} aria-hidden="true" /></button></div>
      <div className="portal-profile-identity">{avatar ? <img src={avatar} alt="" width={48} height={48} /> : <UserCircle size={48} aria-hidden="true" />}<div><strong>{name}</strong><span><DiscordLogo size={16} aria-hidden="true" /> Discord подключён</span></div></div>
      {loading ? <div className="portal-profile-loading" role="status" aria-label="Загружаем профиль…"><span /><span /><span /></div> :
        <form onSubmit={event => { event.preventDefault(); void save(); }} className="portal-profile-form">
          {field('Имя и фамилия', 'full_name', 'Например, Кира Комиссарова')}
          {field('Звание', 'rank', 'Ваше текущее звание')}
          {field('Должность', 'position', 'Ваша должность во фракции')}
          {field('Личный номер', 'badge', 'Ваш личный номер')}
          <label><span>О себе</span><textarea name="about" rows={3} value={profile.about} onChange={event => change('about', event.target.value)} placeholder="Несколько слов о себе…" /></label>
          {error && <p className="portal-profile-error" role="alert">{error}</p>}
          {saved && <p className="portal-profile-saved" role="status">Изменения сохранены</p>}
          <div className="portal-profile-actions"><button className="portal-primary" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить профиль'}</button><button className="portal-secondary" type="button" onClick={onSignOut}><SignOut size={18} aria-hidden="true" /> Выйти</button></div>
        </form>}
    </div>
  </PortalDialog>;
}
