import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CaretDown, Clock } from '@phosphor-icons/react';

type Props = { label: string; name: string; value: string; onChange: (value: string) => void; disabled?: boolean; alignEnd?: boolean };
const pad = (value: number) => String(value).padStart(2, '0');
export default function TimePicker({ label, name, value, onChange, disabled, alignEnd }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const hours = useRef<HTMLDivElement>(null), minutes = useRef<HTMLDivElement>(null);
  const [hour, minute] = value.split(':').map(Number);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    for (const list of [hours.current, minutes.current]) {
      const selected = list?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (list && selected) list.scrollTop = selected.offsetTop - list.clientHeight / 2 + selected.offsetHeight / 2;
    }
    hours.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const keyboard = (event: KeyboardEvent<HTMLDivElement>, isHours: boolean) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-time-value]');
    if (!button) return;
    event.preventDefault();
    const max = isHours ? 23 : 59, current = Number(button.dataset.timeValue);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? max : Math.max(0, Math.min(max, current + (event.key === 'ArrowDown' ? 1 : -1)));
    onChange(isHours ? `${pad(next)}:${pad(minute)}` : `${pad(hour)}:${pad(next)}`);
    (isHours ? hours : minutes).current?.querySelector<HTMLButtonElement>(`[data-time-value="${next}"]`)?.focus();
  };
  return <div className="time-picker" ref={root} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <span className="time-picker-label" id={`${id}-label`}>{label}</span>
    <input type="hidden" name={name} value={value} />
    <button type="button" ref={trigger} className="time-picker-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-popup`} aria-labelledby={`${id}-label ${id}-value`} onClick={() => setOpen(v => !v)}>
      <Clock size={20} aria-hidden="true" /><span id={`${id}-value`}>{value}</span><CaretDown size={16} aria-hidden="true" />
    </button>
    {open && <div role="dialog" aria-label={`Выбор времени: ${label.toLowerCase()}`} id={`${id}-popup`} className={'time-picker-popup' + (alignEnd ? ' align-end' : '')} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div className="time-picker-columns">
        {([{ title: 'Часы', count: 24, selected: hour, ref: hours, isHours: true }, { title: 'Минуты', count: 60, selected: minute, ref: minutes, isHours: false }]).map(column => <div key={column.title}>
          <span className="time-picker-column-label">{column.title}</span>
          <div className="time-picker-options" role="group" aria-label={column.title} ref={column.ref} onKeyDown={event => keyboard(event, column.isHours)}>
            {Array.from({ length: column.count }, (_, number) => <button type="button" key={number} data-time-value={number} tabIndex={number === column.selected ? 0 : -1} aria-label={`${column.title}: ${pad(number)}`} aria-pressed={number === column.selected}
              onClick={() => onChange(column.isHours ? `${pad(number)}:${pad(minute)}` : `${pad(hour)}:${pad(number)}`)}>{pad(number)}</button>)}
          </div>
        </div>)}
      </div>
      <button type="button" className="time-picker-done" onClick={close}>Готово <span>{value}</span></button>
    </div>}
  </div>;
}
