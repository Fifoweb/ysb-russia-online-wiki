import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowLeft, ArrowUpRight, ArrowsClockwise, Buildings, Check, CheckCircle, DiscordLogo, FloppyDisk,
  IdentificationCard, LockKey, ShieldCheck, SignOut, Trophy, UserCircle, UserFocus } from '@phosphor-icons/react';
import PageTransition from '../components/PageTransition';
import PortalLink from '../components/PortalLink';
import MyVacations from '../components/MyVacations';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/useProfile';
import { departmentStatusText, profileDepartmentLabel, profileWriteValues, validateProfile, type Profile, type ProfileErrors } from '../lib/profileData';
import { trustedDiscordAvatar } from '../lib/trustedDiscordAvatar';
import '../account.css';

interface ProfilePageProps { onNavigate: (path: string) => void; }
const shortcuts = [
  { path: '/achievement-report', title: 'Отчёт по ачивкам', description: 'Добавить вклад в цели недели', icon: Trophy },
  { path: '/academy-report', title: 'Отчёт на повышение', description: 'Подтвердить проделанную работу', icon: ShieldCheck },
  { path: '/department', title: 'Перевод в отдел', description: 'Подать кадровое заявление', icon: Buildings },
];

function ProfileSkeleton() {
  return <div className="account-layout account-skeleton" role="status" aria-label="Загружаем личный кабинет…">
    <div className="account-panel"><span className="account-skeleton-avatar" /><span /><span /><span /></div>
    <div className="account-panel"><span /><span /><span /><span /></div>
  </div>;
}

function EmployeeCard({ user, profile, signOut }: { user: User; profile: Profile; signOut: () => Promise<void> }) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const identity = user.identities?.find(item => item.provider === 'discord')?.identity_data as Record<string, unknown> | undefined;
  const discordName = typeof identity?.username === 'string' ? identity.username : 'Аккаунт Discord';
  const discordId = typeof identity?.sub === 'string' && /^\d{17,20}$/.test(identity.sub) ? identity.sub : '';
  const avatar = trustedDiscordAvatar(user.user_metadata?.avatar_url);
  const complete = [profile.game_nickname, profile.static_id, profile.department].filter(Boolean).length;
  return <aside className="account-sidebar">
    <section className="account-employee-card liquid-glass" aria-label="Карточка сотрудника">
      <div className="account-card-heading"><img src={import.meta.env.BASE_URL + 'emblem.png'} width={40} height={40} alt="" /><span>ГИБДД<span>Карточка сотрудника</span></span><ShieldCheck size={24} aria-hidden="true" /></div>
      <div className="account-avatar">{avatar ? <img src={avatar} width={80} height={80} alt="" /> : <UserCircle size={80} weight="duotone" aria-hidden="true" />}</div>
      <h2>{profile.game_nickname || 'Ваш игровой никнейм'}</h2>
      <p className="account-card-department">{profileDepartmentLabel(profile.department).split(' | ')[0] || 'Отдел не определён'}</p>
      <dl className="account-card-static"><dt>StaticID</dt><dd>{profile.static_id ? `#${profile.static_id}` : 'Не указан'}</dd></dl>
      <div className="account-completeness"><div><span>{complete === 3 ? 'Готово к отчётам' : 'Заполнение профиля'}</span><strong>{complete} из 3</strong></div><progress max={3} value={complete} aria-label="Заполнение профиля" /></div>
    </section>
    <section className="account-panel account-discord" aria-labelledby="account-discord-title">
      <div className="account-section-title"><DiscordLogo size={24} aria-hidden="true" /><h2 id="account-discord-title">Discord подключён</h2><CheckCircle size={20} weight="fill" aria-label="Подключён" /></div>
      <p>Вход и ваш профиль привязаны к этому аккаунту.</p>
      <dl><div><dt>Аккаунт</dt><dd>{discordName}</dd></div>{discordId && <div><dt>Discord ID</dt><dd>{discordId}</dd></div>}</dl>
      <button className="account-signout" type="button" disabled={signingOut} onClick={async () => {
        setSigningOut(true); setError('');
        try { await signOut(); } catch { setError('Не удалось завершить выход. Попробуйте ещё раз.'); setSigningOut(false); }
      }}><SignOut size={20} aria-hidden="true" />{signingOut ? 'Выходим…' : 'Выйти из аккаунта'}</button>
      {error && <p className="account-error" role="alert">{error}</p>}
    </section>
  </aside>;
}

function ProfileEditor({ profile, save, refresh, refreshing }: { profile: Profile; save: (profile: Profile) => Promise<Profile>; refresh: () => Promise<void>; refreshing: boolean }) {
  const [draft, setDraft] = useState(profile);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const edited = useRef(false);
  const dirty = JSON.stringify(profileWriteValues(draft)) !== JSON.stringify(profileWriteValues(profile));
  useEffect(() => {
    setDraft(current => edited.current ? { ...current, department: profile.department, department_status: profile.department_status, department_checked_at: profile.department_checked_at } : profile);
  }, [profile]); // Preserve an unsaved draft during a background refresh.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const change = (key: keyof Profile, value: string) => {
    edited.current = true;
    setDraft(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined }));
    setSaved(false); setError('');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const invalid = validateProfile(draft);
    setErrors(invalid); setSaved(false); setError('');
    if (Object.keys(invalid).length) {
      const first = Object.keys(invalid)[0];
      const details = formRef.current?.querySelector('details');
      if (details && !['game_nickname', 'static_id', 'department'].includes(first)) details.open = true;
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setSaving(true);
    try { const result = await save(draft); edited.current = false; setDraft(result); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить профиль. Попробуйте ещё раз.'); }
    finally { setSaving(false); }
  };
  const fieldError = (key: keyof Profile) => errors[key] && <span id={`profile-${key}-error`} className="account-field-error" role="alert">{errors[key]}</span>;
  return <section className="account-panel account-editor" aria-labelledby="account-data-title">
    <div className="account-section-title"><IdentificationCard size={28} weight="duotone" aria-hidden="true" /><div><h2 id="account-data-title">Игровые данные</h2><p>Заполните один раз. Используйте в каждом отчёте.</p></div></div>
    <form ref={formRef} onSubmit={submit} noValidate aria-busy={saving}>
      <fieldset disabled={saving} className="account-fields">
        <legend className="sr-only">Данные для автозаполнения</legend>
        <label htmlFor="profile-game-nickname"><span>Никнейм в игре <span aria-hidden="true">*</span></span>
          <input id="profile-game-nickname" name="game_nickname" autoComplete="off" spellCheck={false} required maxLength={80} value={draft.game_nickname} onChange={event => change('game_nickname', event.target.value)} placeholder="Например, Kira_Comis…" aria-invalid={Boolean(errors.game_nickname)} aria-describedby={errors.game_nickname ? 'profile-game_nickname-error' : 'profile-nickname-hint'} />
          {fieldError('game_nickname')}<small id="profile-nickname-hint">Укажите никнейм так, как он написан в игре.</small>
        </label>
        <label htmlFor="profile-static-id"><span>StaticID <span aria-hidden="true">*</span></span>
          <input id="profile-static-id" name="static_id" autoComplete="off" spellCheck={false} inputMode="numeric" required maxLength={10} pattern="[0-9]{1,10}" value={draft.static_id} onChange={event => change('static_id', event.target.value)} placeholder="Например, 75463…" aria-invalid={Boolean(errors.static_id)} aria-describedby={errors.static_id ? 'profile-static_id-error' : 'profile-static-hint'} />
          {fieldError('static_id')}<small id="profile-static-hint">Только цифры, без знака #.</small>
        </label>
        <div className="account-field-wide account-department-field">
          <label htmlFor="profile-department">Ваш отдел в Discord</label>
          <div className="account-department-control">
            <input id="profile-department" readOnly value={profileDepartmentLabel(profile.department).split(' | ')[0] || 'Отдел не определён'} aria-describedby="profile-department-hint" />
            <button type="button" className="portal-secondary" disabled={refreshing} onClick={() => void refresh()}><ArrowsClockwise size={20} aria-hidden="true" />{refreshing ? 'Проверяем…' : 'Обновить'}</button>
          </div>
          <small id="profile-department-hint" role="status">{departmentStatusText(refreshing ? 'pending' : profile.department_status)}</small>
          {profile.department_checked_at && <small>Проверено <time dateTime={profile.department_checked_at}>{new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(profile.department_checked_at))}</time>. После смены роли обновление может занять до минуты.</small>}
        </div>
      </fieldset>
      <div className="account-autofill-info"><CheckCircle size={20} aria-hidden="true" /><p>Никнейм и StaticID заполнятся автоматически. Перед отправкой отчёта вы сможете их проверить и изменить.</p></div>
      <details className="account-additional"><summary>Дополнительные сведения <span>Необязательно</span></summary>
        <fieldset disabled={saving} className="account-fields"><legend className="sr-only">Дополнительные сведения о сотруднике</legend>
          {([['full_name', 'Имя и фамилия'], ['rank', 'Звание'], ['position', 'Должность'], ['badge', 'Личный номер']] as const).map(([key, label]) => <label key={key} htmlFor={`profile-${key}`}><span>{label}</span><input id={`profile-${key}`} name={key} autoComplete="off" maxLength={100} value={draft[key]} onChange={event => change(key, event.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `profile-${key}-error` : undefined} />{fieldError(key)}</label>)}
          <label htmlFor="profile-about" className="account-field-wide"><span>О себе</span><textarea id="profile-about" name="about" autoComplete="off" rows={3} maxLength={1000} value={draft.about} onChange={event => change('about', event.target.value)} aria-invalid={Boolean(errors.about)} aria-describedby={errors.about ? 'profile-about-error' : undefined} />{fieldError('about')}</label>
        </fieldset>
      </details>
      {error && <p className="account-error" role="alert">{error}</p>}
      {saved && <p className="account-saved" role="status"><Check size={20} aria-hidden="true" />Профиль сохранён. Данные готовы к автозаполнению.</p>}
      <div className="account-save-row"><button type="submit" disabled={saving} className="portal-primary"><FloppyDisk size={20} aria-hidden="true" />{saving ? 'Сохраняем…' : 'Сохранить профиль'}</button><span>{dirty ? 'Есть несохранённые изменения' : profile.updated_at ? <>Сохранено <time dateTime={profile.updated_at}>{new Date(profile.updated_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</time></> : 'Никнейм и StaticID для быстрого заполнения отчётов'}</span></div>
    </form>
  </section>;
}

export default function ProfilePage({ onNavigate }: ProfilePageProps) {
  const { user, loading, enabled, signInWithDiscord, signOut } = useAuth();
  const { profile, status, error, refresh, save } = useProfile();
  return <PageTransition className="account-page">
    <PortalLink className="account-back" path="/" onNavigate={onNavigate}><ArrowLeft size={16} aria-hidden="true" />На главную</PortalLink>
    <div className="account-page-heading"><div><h1>Личный кабинет</h1><p>Ваши данные для службы и отчётов.</p></div><span className="account-private-badge"><LockKey size={16} aria-hidden="true" />Только для вас</span></div>
    {loading && !user ? <ProfileSkeleton /> : !user ? <section className="account-welcome account-panel">
      <div className="account-welcome-mark"><UserFocus size={64} weight="duotone" aria-hidden="true" /></div>
      <h2>Ваш профиль начинается с Discord</h2><p>Войдите в аккаунт и сохраните игровой никнейм и StaticID. Отдел определится по вашим ролям на сервере ГИБДД. Данные будут подставляться в подходящие отчёты.</p>
      {enabled ? <button type="button" className="portal-primary" onClick={() => void signInWithDiscord('/profile')}><DiscordLogo size={24} aria-hidden="true" />Войти через Discord</button> : <p role="alert">Вход временно недоступен. Попробуйте позже.</p>}
      <div className="account-welcome-features"><span><IdentificationCard size={20} aria-hidden="true" />Игровой профиль</span><span><CheckCircle size={20} aria-hidden="true" />Автозаполнение отчётов</span><span><LockKey size={20} aria-hidden="true" />Доступ через ваш Discord</span></div>
    </section> : (status === 'loading' || status === 'idle') && profile.department_status === 'pending' ? <ProfileSkeleton /> : status === 'error' && profile.department_status === 'pending' ? <section className="account-panel account-load-error" role="alert"><IdentificationCard size={40} aria-hidden="true" /><h2>Профиль пока не загрузился</h2><p>{error}</p><button type="button" className="portal-primary" onClick={() => void refresh()}>Загрузить ещё раз</button></section> : <>
      <div className="account-layout"><EmployeeCard user={user} profile={profile} signOut={signOut} /><div className="account-main"><ProfileEditor key={user.id} profile={profile} save={save} refresh={refresh} refreshing={status === 'loading'} />{status === 'error' && <p className="account-error" role="alert">{error}</p>}<p className="account-sync-note"><LockKey size={16} aria-hidden="true" />Данные доступны при входе с этим Discord на любом устройстве.</p></div></div>
      <MyVacations userId={user.id} onNavigate={onNavigate} />
      <section className="account-shortcuts" aria-labelledby="account-shortcuts-title"><h2 id="account-shortcuts-title">Перейти к работе</h2><div>{shortcuts.map(({ path, title, description, icon: Icon }) => <PortalLink key={path} path={path} onNavigate={onNavigate}><Icon size={28} weight="duotone" aria-hidden="true" /><span><strong>{title}</strong><span>{description}</span></span><ArrowUpRight size={20} aria-hidden="true" /></PortalLink>)}</div></section>
    </>}
  </PageTransition>;
}
