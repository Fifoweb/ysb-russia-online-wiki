import { useEffect, useState } from 'react';
import { ArrowsClockwise, CalendarBlank, Clock, MagnifyingGlass, UsersThree } from '@phosphor-icons/react';
import PageTransition from '../components/PageTransition';
import PortalLink from '../components/PortalLink';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { profileDepartmentLabel } from '../lib/profileData';
import { vacationDate, vacationDuration, type VacationRow } from '../lib/vacation';
import { VACATIONS_CHANGED } from '../lib/endVacation';
import '../vacation.css';

export default function VacationDashboard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, loading, signInWithDiscord } = useAuth();
  const [rows, setRows] = useState<VacationRow[] | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('all');
  const [limit, setLimit] = useState(30);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const load = async () => {
      if (!user || !supabase) return;
      const request = ++generation;
      setBusy(true);
      try {
        const { data, error } = await supabase.rpc('list_vacations');
        if (active && generation === request) { if (error) setError('Не удалось загрузить список отпусков.'); else { setRows(data || []); setError(''); } }
      } catch { if (active && generation === request) setError('Не удалось загрузить список отпусков.'); }
      finally { if (active && generation === request) { setBusy(false); setNow(Date.now()); } }
    };
    void load();
    const refreshList = () => { void load(); };
    const storage = (event: StorageEvent) => { if (event.key === VACATIONS_CHANGED) refreshList(); };
    const timer = window.setInterval(refreshList, 15_000);
    window.addEventListener(VACATIONS_CHANGED, refreshList);
    window.addEventListener('focus', refreshList);
    window.addEventListener('storage', storage);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener(VACATIONS_CHANGED, refreshList); window.removeEventListener('focus', refreshList); window.removeEventListener('storage', storage); };
  }, [user?.id, refresh]);
  const current = (rows || []).filter(row => Date.parse(row.starts_at) <= now && Date.parse(row.ends_at) > now);
  const upcoming = (rows || []).filter(row => Date.parse(row.starts_at) > now);
  const returning = current.filter(row => Date.parse(row.ends_at) <= now + 86400000);
  const departments = [...new Set((rows || []).map(row => row.department))].sort();
  const visible = (rows || []).filter(row => Date.parse(row.ends_at) > now &&
    (!department || (row.department || '__unknown') === department) && row.display_name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')) &&
    (status === 'all' || (status === 'current' ? Date.parse(row.starts_at) <= now : Date.parse(row.starts_at) > now)))
    .sort((a, b) => (Date.parse(a.starts_at) > now ? 1 : 0) - (Date.parse(b.starts_at) > now ? 1 : 0) || Date.parse(a.ends_at) - Date.parse(b.ends_at));

  return <PageTransition className="vacation-page">
    <div className="page-heading vacation-dashboard-heading"><div><p className="eyebrow">Состав фракции</p><h1>Отпуска сотрудников</h1><p>Кто отсутствует сейчас и когда вернётся на службу.</p></div><PortalLink path="/vacation" onNavigate={onNavigate} className="portal-primary">Подать заявку</PortalLink></div>
    {loading ? <p role="status">Проверяем вход…</p> : !user ? <section className="panel vacation-panel"><p>Войдите через Discord, чтобы увидеть список сотрудников.</p><button className="portal-primary" onClick={() => void signInWithDiscord('/vacations')}>Войти через Discord</button></section> : <>
      <div className="vacation-stat-grid">
        {([{ label: 'В отпуске сейчас', value: current.length, Icon: UsersThree }, { label: 'Предстоящие отпуска', value: upcoming.length, Icon: CalendarBlank }, { label: 'Вернутся за 24 часа', value: returning.length, Icon: Clock }]).map(({ label, value, Icon }) =>
          <div className="panel vacation-stat" key={label}><Icon size={24} aria-hidden="true" /><span>{label}</span><strong>{rows ? value : '—'}</strong></div>)}
      </div>
      <div className="vacation-toolbar">
        <label className="vacation-search"><MagnifyingGlass size={20} aria-hidden="true" /><span className="sr-only">Поиск сотрудника</span><input type="search" placeholder="Найти сотрудника…" value={query} onChange={e => { setQuery(e.target.value); setLimit(30); }} /></label>
        <label><span className="sr-only">Отдел</span><select value={department} onChange={e => { setDepartment(e.target.value); setLimit(30); }}><option value="">Все отделы</option>{departments.map(id => <option key={id} value={id || '__unknown'}>{profileDepartmentLabel(id).split(' | ')[0] || 'Отдел не указан'}</option>)}</select></label>
        <label><span className="sr-only">Период</span><select value={status} onChange={e => { setStatus(e.target.value); setLimit(30); }}><option value="all">Все отпуска</option><option value="current">В отпуске сейчас</option><option value="upcoming">Предстоящие</option></select></label>
        <button className="portal-secondary" disabled={busy} onClick={() => setRefresh(value => value + 1)} aria-label="Обновить список отпусков"><ArrowsClockwise size={20} aria-hidden="true" /></button>
      </div>
      <p className="vacation-data-note" role="status">{busy ? 'Обновляем список…' : `Найдено: ${visible.length}. Время московское. Список обновляется каждые 15 секунд.`}</p>
      {error && <p className="vacation-error" role="alert">{error} <button onClick={() => setRefresh(value => value + 1)}>Повторить</button></p>}
      {!rows && !error ? <div className="vacation-skeleton" role="status" aria-label="Загружаем отпуска…"><span /><span /><span /></div> : rows && (visible.length ? <>
        <div className="vacation-list">{visible.slice(0, limit).map((row, index) => {
          const a = Date.parse(row.starts_at), b = Date.parse(row.ends_at), future = a > now;
          const progress = Math.max(0, Math.min(100, (now - a) / (b - a) * 100));
          return <article className="panel vacation-list-card" key={`${row.display_name}-${row.starts_at}-${index}`}>
            <div className="vacation-person"><span className="vacation-person-icon"><CalendarBlank size={22} aria-hidden="true" /></span><div><h2>{row.display_name}</h2><p>{profileDepartmentLabel(row.department).split(' | ')[0] || 'Отдел не указан'}</p></div></div>
            <div className="vacation-period"><span className={'vacation-badge' + (future ? ' upcoming' : '')}>{future ? 'Предстоит' : 'В отпуске'}</span><span>С {vacationDate(row.starts_at)}</span><strong>До {vacationDate(row.ends_at)}</strong><small>{future ? 'До начала' : 'До возвращения'}: {vacationDuration(now, future ? a : b)}</small><progress value={progress} max={100} aria-label="Прошедшая часть отпуска" /></div>
          </article>;
        })}</div>
        {visible.length > limit && <button className="portal-secondary vacation-more" onClick={() => setLimit(value => value + 30)}>Показать ещё</button>}
        {rows.length >= 500 && <p className="vacation-data-note">Показаны первые 500 отпусков.</p>}
      </> : <section className="panel vacation-panel vacation-empty"><CalendarBlank size={40} aria-hidden="true" /><h2>{rows.length ? 'Нет совпадений' : 'Отпусков пока нет'}</h2><p>{rows.length ? 'Измените поиск или фильтры.' : 'После отправки заявки здесь появится период отсутствия сотрудника.'}</p></section>)}
    </>}
  </PageTransition>;
}
