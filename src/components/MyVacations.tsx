import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarBlank, SignIn, X } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import PortalLink from './PortalLink';
import PortalDialog from './PortalDialog';
import { vacationDate as fmt } from '../lib/vacation';
import { endVacation } from '../lib/endVacation';
import '../vacation.css';

type Row = { id: string; reason: string; starts_at: string; ends_at: string; delivery_status: string; returned_at: string | null };
export default function MyVacations({ userId, onNavigate }: { userId: string; onNavigate: (path: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const alive = useRef(true);
  const ended = useRef(new Map<string, string>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setError(false);
    const load = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase.from('vacation_requests').select('id,reason,starts_at,ends_at,delivery_status,returned_at').eq('user_id', userId).order('starts_at', { ascending: false }).limit(20);
        if (active) {
          if (error) setError(true);
          else { setRows((data || []).map(row => ({ ...row, returned_at: ended.current.get(row.id) || row.returned_at }))); setError(false); }
        }
      } catch { if (active) setError(true); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [userId, reload]);
  const close = useCallback(() => { if (!busy.current) setSelected(null); }, []);
  const finish = async () => {
    if (!selected || busy.current) return;
    busy.current = true; setEnding(true); setEndError('');
    try {
      const returnedAt = await endVacation(userId, selected.id);
      if (!alive.current) return;
      ended.current.set(selected.id, returnedAt);
      setRows(current => current?.map(row => row.id === selected.id ? { ...row, returned_at: returnedAt } : row) || null);
      setSelected(null); setNotice('Вы вернулись на службу. Отпуск завершён и убран с дашборда.');
    } catch (error) { if (alive.current) setEndError(error instanceof Error ? error.message : 'Не удалось завершить отпуск. Попробуйте позже.'); }
    finally { busy.current = false; if (alive.current) setEnding(false); }
  };
  return <section className="account-panel vacation-personal" aria-labelledby="my-vacations-title">
    <div className="account-section-title"><CalendarBlank size={24} aria-hidden="true" /><div><h2 id="my-vacations-title">Мои отпуска</h2><p>Заявки и периоды отсутствия</p></div></div>
    {notice && <p className="vacation-return-notice" role="status">{notice}</p>}
    {error ? <p role="alert">Не удалось загрузить отпуска. <button type="button" onClick={() => setReload(v => v + 1)}>Повторить</button></p> : !rows ? <p role="status">Загружаем отпуска…</p> : !rows.length ? <p>Заявок пока нет.</p> : <div className="vacation-personal-list">{rows.map(row => {
      const current = row.delivery_status === 'delivered' && !row.returned_at && Date.parse(row.starts_at) <= Date.now() && Date.parse(row.ends_at) > Date.now();
      return <article key={row.id}>
        <strong>{row.returned_at ? 'Завершён досрочно' : row.delivery_status === 'delivered' ? (Date.parse(row.starts_at) > Date.now() ? 'Предстоящий' : Date.parse(row.ends_at) > Date.now() ? 'В отпуске' : 'Завершён') : row.delivery_status === 'failed' ? 'Не доставлено' : 'Доставка требует проверки'}</strong>
        <span>{fmt(row.starts_at)} — {fmt(row.ends_at)} МСК</span>
        <p>{row.reason}</p>
        {row.returned_at && <p>Возвращение на службу: {fmt(row.returned_at)} МСК</p>}
        {current && <button type="button" className="portal-secondary vacation-return-button" onClick={() => { setEndError(''); setSelected(row); }}><SignIn size={20} aria-hidden="true" />Вернуться на службу</button>}
      </article>;
    })}</div>}
    <div className="vacation-actions"><PortalLink path="/vacation" onNavigate={onNavigate} className="portal-secondary">Подать заявку</PortalLink><PortalLink path="/vacations" onNavigate={onNavigate} className="portal-secondary">Все отпуска</PortalLink></div>
    <PortalDialog open={Boolean(selected)} onClose={close} label="Досрочное завершение отпуска" className="vacation-return-dialog">
      <div className="portal-dialog-surface">
        <div className="portal-dialog-heading"><div><p>Возвращение на службу</p><h2>Завершить отпуск раньше?</h2></div><button type="button" className="portal-icon-button" disabled={ending} onClick={close} aria-label="Закрыть подтверждение"><X size={22} aria-hidden="true" /></button></div>
        <p>Отпуск закончится сейчас, и вы исчезнете из списка отсутствующих. Первоначальный срок сохранится в истории.</p>
        {endError && <p className="vacation-error" role="alert">{endError}</p>}
        <div className="vacation-actions"><button type="button" className="portal-secondary" disabled={ending} onClick={close}>Остаться в отпуске</button><button type="button" className="portal-primary" disabled={ending} aria-busy={ending} onClick={() => void finish()}>{ending ? 'Завершаем…' : 'Завершить отпуск'}</button></div>
      </div>
    </PortalDialog>
  </section>;
}
