import { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import '../vacation.css';
import { moscowToday } from '../lib/vacation';

type Props = { start: string; end: string; onChange: (start: string, end: string) => void; disabled?: boolean };
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function VacationCalendar({ start, end, onChange, disabled }: Props) {
  const today = moscowToday();
  const initial = start || today;
  const [month, setMonth] = useState(() => new Date(`${initial.slice(0, 7)}-01T00:00:00Z`));
  const year = month.getUTCFullYear(), index = month.getUTCMonth();
  const offset = (new Date(Date.UTC(year, index, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const title = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month);
  const shift = (amount: number) => setMonth(new Date(Date.UTC(year, index + amount, 1)));
  return <div className="vacation-calendar" aria-label="Выбор периода отпуска">
    <div className="vacation-calendar-header"><div><span>Период отпуска</span><h2>{title}</h2></div><div>
      <button type="button" disabled={disabled || month.toISOString().slice(0,7) <= today.slice(0,7)} onClick={() => shift(-1)} aria-label="Предыдущий месяц"><CaretLeft size={20} aria-hidden="true" /></button>
      <button type="button" disabled={disabled} onClick={() => shift(1)} aria-label="Следующий месяц"><CaretRight size={20} aria-hidden="true" /></button>
    </div></div>
    <p className="vacation-calendar-hint" role="status">{!start || end ? 'Выберите дату начала, затем дату окончания.' : 'Теперь выберите дату окончания. Можно выбрать тот же день.'}</p>
    <div className="vacation-calendar-grid" aria-label={title}>
      {days.map(day => <span className="vacation-weekday" key={day}>{day}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
      {Array.from({ length: count }, (_, i) => {
        const date = new Date(Date.UTC(year, index, i + 1)), value = isoDate(date);
        const selected = value === start || value === end, between = Boolean(start && end && value > start && value < end);
        return <button type="button" key={value} disabled={disabled || value < today} aria-current={value===today?'date':undefined} aria-pressed={selected} className={between ? 'in-range' : ''}
          aria-label={new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)}
          onClick={() => !start || end || value < start ? onChange(value, '') : onChange(start, value)}>{i + 1}</button>;
      })}
    </div>
    <div className="vacation-calendar-summary"><span>Начало <strong>{start ? new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${start}T00:00:00Z`)) : 'Не выбрано'}</strong></span><span>Окончание <strong>{end ? new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${end}T00:00:00Z`)) : 'Не выбрано'}</strong></span><button type="button" disabled={disabled} onClick={() => onChange('', '')}>Очистить</button></div>
  </div>;
}
