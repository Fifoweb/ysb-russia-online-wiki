import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, CheckCircle2, Clock3, RefreshCw, Target, Trophy, Users } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import FormLoader from '../components/FormLoader';
import { achievementDepartments, achievementGoals, achievementWeekStart, addAchievementDays,
  achievementPublicationRules, type AchievementDepartment } from '../data/achievements';
import { achievementCompletion, fetchAchievementDashboard, formatAchievementValue, type AchievementDashboardData } from '../lib/achievements';

const dateLabel = (date: string) => new Date(date + 'T12:00:00+03:00').toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'Europe/Moscow' });
const weekLabel = (date: string) => `${dateLabel(date)} — ${dateLabel(addAchievementDays(date, 6))}`;

export default function AchievementsDashboard() {
  const [now, setNow] = useState(() => new Date());
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [department, setDepartment] = useState<AchievementDepartment | ''>('');
  const [status, setStatus] = useState<'all' | 'active' | 'done'>('all');
  const [data, setData] = useState<AchievementDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const currentWeek = achievementWeekStart(now);
  const availableWeeks = [currentWeek, ...(data?.availableWeeks ?? []).filter(start => start < currentWeek)]
    .filter((start, index, weeks) => weeks.indexOf(start) === index)
    .sort((left, right) => right.localeCompare(left));
  const week = selectedWeek ?? currentWeek;
  const weekOffset = (new Date(week).getTime() - new Date(currentWeek).getTime()) / (7 * 86400_000);

  useEffect(() => {
    const boundary = new Date(addAchievementDays(currentWeek, 7) + 'T00:00:00+03:00').getTime();
    const timer = window.setTimeout(() => setNow(new Date()), Math.max(0, boundary - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [currentWeek]);

  useEffect(() => {
    const tick = () => { if (!document.hidden) setNow(new Date()); };
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const next = await fetchAchievementDashboard(week, controller.signal);
        if (!controller.signal.aborted) { setData(next); setError(''); }
      } catch {
        if (!controller.signal.aborted) setError('Не удалось загрузить прогресс. Попробуйте обновить данные.');
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    const timer = window.setInterval(() => { if (weekOffset === 0) void load(); }, 60_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [week, weekOffset, refresh]);

  const visibleData = data?.weekStart === week ? data : null;
  const rankedDepartments = useMemo(() => achievementDepartments.map((dept, order) => {
    let reports = 0;
    const contribution = achievementGoals.reduce((sum, goal) => {
      const record = visibleData?.items.find(item => item.id === goal.id);
      const progress = record?.departments[dept.id];
      reports += progress?.reports ?? 0;
      return sum + Math.max(0, progress?.value ?? 0) / (record?.target ?? goal.target) * 100;
    }, 0) / achievementGoals.length;
    return { ...dept, contribution, reports, order };
  }).sort((left, right) => right.contribution - left.contribution ||
    Number(right.reports > 0) - Number(left.reports > 0) || left.order - right.order), [visibleData]);
  const cards = useMemo(() => achievementGoals.map(goal => {
    const record = visibleData?.items.find(item => item.id === goal.id);
    const progress = department ? record?.departments[department] : record;
    const value = progress?.value ?? 0;
    const target = record?.target ?? goal.target;
    return { ...goal, target, value, reports: progress?.reports ?? 0, percent: achievementCompletion(value, target) };
  }), [visibleData, department]);
  const complete = cards.filter(item => item.value >= item.target).length;
  const overall = Math.round(cards.reduce((sum, item) => sum + item.percent, 0) / cards.length);
  const reports = cards.reduce((sum, item) => sum + item.reports, 0);
  const activeDepartments = achievementDepartments.filter(dept => visibleData?.items.some(item => item.departments[dept.id]?.reports > 0)).length;
  const filteredCards = cards.filter(item => status === 'all' || (status === 'done' ? item.value >= item.target : item.value < item.target));
  const maxDaily = Math.max(1, ...visibleData?.days.map(day => day.reports) ?? []);
  const end = new Date(currentWeek + 'T00:00:00+03:00').getTime() + 7 * 86400_000;
  const hoursLeft = Math.max(0, Math.ceil((end - now.getTime()) / 3600_000));

  return <PageTransition className="catalog-page achievements-page">
    <div className="page-heading page-heading-row">
      <div><p className="eyebrow">ГИБДД · НЕДЕЛЬНЫЕ ЦЕЛИ</p><h1>Ачивки фракции</h1><p>Девять целей. Общий результат и вклад каждого отдела.</p></div>
      <span className="achievement-week-pill"><CalendarDays size={16} /> {weekLabel(week)} · МСК</span>
    </div>

    <div className="achievement-toolbar">
      <label><span>Неделя</span><select value={week} disabled={availableWeeks.length === 1} onChange={event => setSelectedWeek(event.target.value === currentWeek ? null : event.target.value)}>
        {availableWeeks.map(start => <option key={start} value={start}>{start === currentWeek ? 'Текущая · ' : ''}{weekLabel(start)}</option>)}
      </select></label>
      <label><span>Отдел</span><select value={department} onChange={event => setDepartment(event.target.value as AchievementDepartment | '')}>
        <option value="">Вся фракция</option>{rankedDepartments.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <button type="button" className="secondary-button" onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="Обновить прогресс ачивок">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Обновить
      </button>
    </div>

    {error && <div className="achievement-error" role="alert">{error}{visibleData && ' Показаны последние загруженные данные.'}</div>}
    {!visibleData ? loading ? <FormLoader /> : <div className="panel achievement-empty">Данные временно недоступны. Счётчики появятся после успешной загрузки.</div> : <>
      <section className="panel achievement-overview" aria-label="Итоги недели">
        <div className="achievement-overview-copy">
          <p className="eyebrow">{department ? achievementDepartments.find(item => item.id === department)?.label : 'ОБЩИЙ ПРОГРЕСС ФРАКЦИИ'}</p>
          <h2><Trophy size={24} /> {complete}<span> / 9 целей выполнено по отчётам</span></h2>
          <p>Каждый отправленный отчёт приближает фракцию к недельной цели.</p>
          <div className="achievement-overview-stats">
            <span><strong>{reports}</strong><small>отчётов{department ? ' отдела' : ' за неделю'}</small></span>
            <span><strong>{visibleData.contributors}</strong><small>участников во фракции</small></span>
            <span><strong>{activeDepartments}</strong><small>отделов участвуют</small></span>
          </div>
        </div>
        <div className="achievement-ring" role="img" aria-label={`Общий прогресс: ${overall} процентов`}>
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" className="achievement-ring-track" /><circle cx="60" cy="60" r="52" className="achievement-ring-value" strokeDasharray={`${overall / 100 * 326.73} 326.73`} /></svg>
          <span><strong>{overall}%</strong><small>средний прогресс целей</small></span>
        </div>
      </section>

      <div className="achievement-data-caption"><span><Clock3 size={14} />{weekOffset === 0 ? `До новой недели: ${hoursLeft >= 24 ? `${Math.floor(hoursLeft / 24)} д. ${hoursLeft % 24} ч.` : `${hoursLeft} ч.`}` : 'Архив недели'}</span><span>Обновлено {new Date(visibleData.generatedAt).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })} МСК · автообновление раз в минуту</span></div>
      <p className="achievement-disclaimer">Обнуление — пн 00:00 МСК, учёт новых данных — с 00:01. Прогресс рассчитан по доставленным отчётам; окончательный зачёт подтверждают кураторы.</p>

      <div className="achievement-section-heading"><h2><Target size={18} /> Цели недели</h2><div className="achievement-filters" aria-label="Фильтр целей">
        {([['all', 'Все'], ['active', 'В работе'], ['done', 'Выполнены']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{label}</button>)}
      </div></div>
      <div className="achievement-grid">
        {filteredCards.map(item => <article key={item.id} className={`panel achievement-card${item.value >= item.target ? ' achievement-card-done' : ''}`}>
          <div className="achievement-card-top"><span className="achievement-card-icon" aria-hidden="true">{item.emoji}</span><span className="achievement-card-status">{item.value >= item.target ? <><CheckCircle2 size={13} /> Цель достигнута</> : item.reports ? 'В работе' : 'Ожидает отчётов'}</span></div>
          <h3>{item.title}</h3><p>{item.description}</p>
          <div className="achievement-card-value"><strong>{formatAchievementValue(item.value)}</strong><span>/ {item.target} {item.unit}</span></div>
          <div className="achievement-progress" role="progressbar" aria-label={item.title} aria-valuemin={0} aria-valuemax={item.target} aria-valuenow={Math.min(item.value, item.target)} aria-valuetext={`${formatAchievementValue(item.value)} из ${item.target}`}><span style={{ width: `${item.percent}%` }} /></div>
          <div className="achievement-card-bottom"><span>{item.metric === 'average' ? `${item.reports} замеров · среднее` : item.metric === 'distinct-days' ? 'Проверки в разные дни' : `${item.reports} отчётов`}</span><strong>{item.value >= item.target ? 'Выполнено' : `Осталось ${formatAchievementValue(item.target - item.value)}`}</strong></div>
        </article>)}
      </div>
      {!filteredCards.length && <div className="panel achievement-empty">В этом фильтре пока нет целей.</div>}

      <section className="panel achievement-departments">
        <div className="achievement-section-heading"><h2><Users size={18} /> Вклад отделов</h2><span>Вся фракция · {weekLabel(week)}</span></div>
        <p>Отделы расположены по убыванию вклада — среднего процента выполнения девяти целей. Работа сверх цели тоже учитывается. Онлайн — среднее по замерам, склад — число разных дней.</p>
        <div className="achievement-table-scroll" tabIndex={0} role="region" aria-label="Таблица вклада отделов, прокручивается по горизонтали">
          <table><thead><tr><th scope="col">Отдел</th><th scope="col">Вклад</th>{achievementGoals.map(goal => <th key={goal.id} scope="col" title={goal.description}><span aria-hidden="true">{goal.emoji}</span> {goal.title}</th>)}</tr></thead>
            <tbody>{rankedDepartments.map((dept, index) => <tr key={dept.id}><th scope="row" title={dept.label}><span className="text-sky-300 mr-2" aria-label={`Место ${index + 1}`}>{index + 1}.</span>{dept.label.split(' | ')[0]}</th><td className={dept.reports ? 'achievement-cell-active' : ''}>{dept.reports ? `${formatAchievementValue(dept.contribution)}%` : '—'}</td>{achievementGoals.map(goal => {
              const progress = visibleData.items.find(item => item.id === goal.id)?.departments[dept.id];
              return <td key={goal.id} className={progress?.reports ? 'achievement-cell-active' : ''}>{progress?.reports ? formatAchievementValue(progress.value) : '—'}</td>;
            })}</tr>)}</tbody></table>
        </div>
      </section>

      <section className="panel achievement-activity"><div className="achievement-section-heading"><h2><Activity size={18} /> Отчёты по дням выполнения</h2><span>Вся фракция</span></div>
        <div className="achievement-days">{visibleData.days.map(day => <div key={day.date} className="achievement-day" aria-label={`${dateLabel(day.date)}: ${day.reports} отчётов`}><strong>{day.reports}</strong><div className="achievement-day-track"><span style={{ height: `${day.reports ? Math.max(6, day.reports / maxDaily * 100) : 0}%` }} /></div><span>{new Date(day.date + 'T12:00:00Z').toLocaleDateString('ru-RU', { weekday: 'short', timeZone: 'Europe/Moscow' })}</span><small>{dateLabel(day.date)}</small></div>)}</div>
      </section>
    </>}

    <details className="panel achievement-rules"><summary>Правила публикации отчётов</summary><ul>{achievementPublicationRules.map(rule => <li key={rule}>{rule}</li>)}</ul></details>
  </PageTransition>;
}
