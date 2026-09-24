import { useEffect, useMemo, useState } from 'react';
import { Activity, Clock3, RefreshCw, Server as ServerIcon, Wifi } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { fetchTverskoyOnline, type TverskoyOnline } from '../lib/online';

function formatTime(timestamp: number) { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp); }

export default function Servers() {
  const [data, setData] = useState<TverskoyOnline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<'1d' | '7d' | '30d'>('1d');

  useEffect(() => {
    const controller = new AbortController();
    const load = () => fetchTverskoyOnline(controller.signal, period).then(value => { setData(value); setError(false); }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [period]);

  const visiblePoints = useMemo(() => {
    if (!data) return [];
    return data.points;
  }, [data]);
  const max = Math.max(...visiblePoints.map(point => point.value), 1);
  const min = Math.min(...visiblePoints.map(point => point.value), max);
  const chartPath = visiblePoints.map((point, index) => {
    const x = visiblePoints.length < 2 ? 0 : (index / (visiblePoints.length - 1)) * 100;
    const y = 92 - ((point.value - min) / Math.max(1, max - min)) * 72;
    return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');

  return <PageTransition className="catalog-page">
    <div className="page-heading page-heading-row"><div><p className="eyebrow">МОНИТОРИНГ СЕРВЕРОВ</p><h1>Онлайн Тверского</h1><p>Текущий онлайн сервера Тверской по данным Россия Онлайн Вики.</p></div><div className="period-tabs" role="tablist" aria-label="Период графика">{(['1d', '7d', '30d'] as const).map(value => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)} role="tab" aria-selected={period === value}>{value === '1d' ? '1Д' : value === '7d' ? '7Д' : '30Д'}</button>)}</div></div>
    <section className="online-hero panel"><div className="online-value"><span className="status-dot" />{loading ? '—' : data?.current.toLocaleString('ru-RU') || 'Нет данных'}</div><div className="online-caption"><Wifi size={15} /> игроков онлайн на сервере Тверской</div><div className="online-meta"><span><ServerIcon size={14} /> ro2 · Тверской</span><span><Clock3 size={14} /> {data ? `обновлено в ${formatTime(data.fetchedAt)}` : 'ожидание данных'}</span></div>{error && <p className="data-note">Источник временно недоступен. Попробуйте обновить страницу.</p>}</section>
    <section className="chart-panel panel"><div className="panel-heading"><div><p className="eyebrow">ДИНАМИКА</p><h2><Activity size={18} /> Онлайн за период</h2></div><button className="icon-button" onClick={() => { setLoading(true); fetchTverskoyOnline(undefined, period).then(value => { setData(value); setError(false); }).catch(() => setError(true)).finally(() => setLoading(false)); }} title="Обновить данные" aria-label="Обновить данные"><RefreshCw size={16} /></button></div>{visiblePoints.length ? <div className="online-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="График онлайна сервера Тверской"><defs><linearGradient id="online-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#45c978" stopOpacity=".32" /><stop offset="1" stopColor="#45c978" stopOpacity="0" /></linearGradient></defs><path d={`${chartPath} L100 100 L0 100 Z`} fill="url(#online-fill)" /><path d={chartPath} fill="none" stroke="#4bd27f" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></svg><div className="chart-axis"><span>{formatTime(visiblePoints[0].timestamp)}</span><span>{formatTime(visiblePoints[visiblePoints.length - 1].timestamp)}</span></div></div> : <div className="chart-empty">Загрузка истории онлайна…</div>}</section>
  </PageTransition>;
}
