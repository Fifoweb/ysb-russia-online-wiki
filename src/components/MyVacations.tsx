import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarBlank, Plus, SignIn, X } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import PortalLink from './PortalLink';
import PortalDialog from './PortalDialog';
import { vacationDate as fmt } from '../lib/vacation';
import { cancelVacation, endVacation } from '../lib/endVacation';
import '../vacation.css';

type Row = { id: string; reason: string; starts_at: string; ends_at: string; delivery_status: string; returned_at: string | null; cancelled_at: string | null };
type Selection = { row: Row; cancel: boolean };
const isOpen = (row: Row) => row.delivery_status === 'delivered' && !row.returned_at && !row.cancelled_at && Date.parse(row.ends_at) > Date.now();
const label = (row: Row) => row.cancelled_at ? 'Отменён' : row.returned_at ? 'Завершён досрочно' : row.delivery_status === 'delivered' ? (Date.parse(row.starts_at) > Date.now() ? 'Предстоящий' : Date.parse(row.ends_at) > Date.now() ? 'В отпуске' : 'Завершён') : row.delivery_status === 'failed' ? 'Не доставлено' : 'Доставка требует проверки';
export default function MyVacations({ userId, onNavigate }: { userId: string; onNavigate: (path: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const changed = useRef(new Map<string, Partial<Row>>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setError(false);
    const load = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase.from('vacation_requests').select('id,reason,starts_at,ends_at,delivery_status,returned_at,cancelled_at').eq('user_id', userId).order('starts_at', { ascending: false }).limit(20);
        if (active) {
          if (error) setError(true);
          else { setRows((data || []).map(row => ({ ...row, ...changed.current.get(row.id) }))); setError(false); }
        }
      } catch { if (active) setError(true); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [userId, reload]);
  const close = useCallback(() => { if (!busy.current) { setSelected(null); setHistoryOpen(false); } }, []);
  const finish = async () => {
    if (!selected || busy.current) return;
    busy.current = true; setEnding(true); setEndError('');
    try {
      const at = await (selected.cancel ? cancelVacation : endVacation)(userId, selected.row.id);
      if (!alive.current) return;
      const change = selected.cancel ? { cancelled_at: at } : { returned_at: at };
      changed.current.set(selected.row.id, change);
      setRows(current => current?.map(row => row.id === selected.row.id ? { ...row, ...change } : row) || null);
      setSelected(null); setHistoryOpen(false); setNotice(selected.cancel ? 'Предстоящий отпуск отменён.' : 'Вы вернулись на службу. Отпуск завершён.');
    } catch (error) { if (alive.current) setEndError(error instanceof Error ? error.message : 'Не удалось изменить отпуск. Попробуйте позже.'); }
    finally { busy.current = false; if (alive.current) setEnding(false); }
  };
  const primary = rows?.filter(isOpen).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0]
    || rows?.find(row => ['sending', 'uncertain'].includes(row.delivery_status));
  const actions = (row: Row) => isOpen(row) && <button type="button" className="portal-secondary vacation-return-button" onClick={() => { setEndError(''); setSelected({ row, cancel: Date.parse(row.starts_at) > Date.now() }); }}>
    {Date.parse(row.starts_at) > Date.now() ? <><X size={18} aria-hidden="true" />Отменить отпуск</> : <><SignIn size={18} aria-hidden="true" />Вернуться на службу</>}
  </button>;
  return <section className="account-panel vacation-personal" aria-labelledby="my-vacations-title">
    <div className="vacation-card-heading"><CalendarBlank size={24} aria-hidden="true" /><h2 id="my-vacations-title">Отпуск</h2><PortalLink path="/vacation" onNavigate={onNavigate} aria-label="Подать заявку на отпуск"><Plus size={20} aria-hidden="true" /></PortalLink></div>
    {notice && <p className="vacation-return-notice" role="status">{notice}</p>}
    {error ? <p role="alert">Не удалось загрузить отпуска. <button type="button" onClick={() => setReload(v => v + 1)}>Повторить</button></p> : !rows ? <p role="status">Загружаем отпуска…</p> : <>
      {primary ? <div className="vacation-card-current">
        <span className={'vacation-badge' + (Date.parse(primary.starts_at) > Date.now() ? ' upcoming' : '')}>{label(primary)}</span>
        <dl className="vacation-card-dates"><div><dt>Начало</dt><dd>{fmt(primary.starts_at)}</dd></div><div><dt>Окончание</dt><dd>{fmt(primary.ends_at)}</dd></div></dl>
        {actions(primary)}
      </div> : <p className="vacation-card-empty">Отпуск не запланирован</p>}
    </>}
    <div className="vacation-card-links">{rows && rows.length > 0 ? <button type="button" onClick={() => setHistoryOpen(true)}>Мои заявки ({rows.length})</button> : <PortalLink path="/vacation" onNavigate={onNavigate}>Подать заявку</PortalLink>}<PortalLink path="/vacations" onNavigate={onNavigate}>Все отпуска</PortalLink></div>
    <PortalDialog open={Boolean(selected) || historyOpen} onClose={close} label={selected ? selected.cancel ? 'Отмена предстоящего отпуска' : 'Досрочное завершение отпуска' : 'Мои заявки на отпуск'} className="vacation-return-dialog">
      <div className="portal-dialog-surface">{!selected ? <>
        <div className="portal-dialog-heading"><div><p>История отпусков</p><h2>Мои заявки</h2></div><button type="button" className="portal-icon-button" onClick={() => setHistoryOpen(false)} aria-label="Закрыть историю"><X size={22} aria-hidden="true" /></button></div>
        <div className="vacation-card-history">{rows?.map(row => <article key={row.id}>
          <strong>{label(row)}</strong><span>{fmt(row.starts_at)} — {fmt(row.ends_at)} МСК</span>
          {row.returned_at && <span>Возвращение: {fmt(row.returned_at)} МСК</span>}
          {row.cancelled_at && <span>Отмена: {fmt(row.cancelled_at)} МСК</span>}
          <p>{row.reason}</p>{actions(row)}
        </article>)}</div>
      </> : <>
        <div className="portal-dialog-heading"><div><p>{selected?.cancel ? 'Предстоящий отпуск' : 'Возвращение на службу'}</p><h2>{selected?.cancel ? 'Отменить отпуск?' : 'Завершить отпуск раньше?'}</h2></div><button type="button" className="portal-icon-button" disabled={ending} onClick={close} aria-label="Закрыть подтверждение"><X size={22} aria-hidden="true" /></button></div>
        <p>{selected?.cancel ? 'Заявка будет убрана с дашборда. Даты и запись об отмене сохранятся в истории.' : 'Отпуск закончится сейчас, и вы исчезнете из списка отсутствующих. Первоначальный срок сохранится в истории.'}</p>
        {endError && <p className="vacation-error" role="alert">{endError}</p>}
        <div className="vacation-actions"><button type="button" className="portal-secondary" disabled={ending} onClick={close}>{selected?.cancel ? 'Сохранить отпуск' : 'Остаться в отпуске'}</button><button type="button" className="portal-primary" disabled={ending} aria-busy={ending} onClick={() => void finish()}>{ending ? (selected?.cancel ? 'Отменяем…' : 'Завершаем…') : (selected?.cancel ? 'Подтвердить отмену' : 'Завершить отпуск')}</button></div>
      </>}</div>
    </PortalDialog>
  </section>;
}
