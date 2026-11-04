import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, Check } from '@phosphor-icons/react';
import '../portal-select.css';

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size' | 'value'> & { value: string; label: string };
type Option = { value: string; text: string; disabled: boolean };
type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };
const textOf = (children: ReactNode): string => Children.toArray(children).map(child => isValidElement<OptionProps>(child) ? textOf(child.props.children) : String(child)).join('');
function optionsOf(children: ReactNode, disabled = false): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<OptionProps>(child)) return [];
    const text = textOf(child.props.children);
    return child.type === 'option'
      ? [{ value: String(child.props.value ?? text), text, disabled: disabled || Boolean(child.props.disabled) }]
      : optionsOf(child.props.children, disabled || Boolean(child.props.disabled));
  });
}

/** Keeps the native field for form validation and existing change handlers. */
export default function PortalSelect({ label, children, className = '', id, value, disabled, required, onChange, onInvalid, ...props }: Props) {
  const generatedId = useId(), controlId = id || generatedId, listId = `${controlId}-options`, errorId = `${controlId}-error`;
  const native = useRef<HTMLSelectElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [invalid, setInvalid] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();
  const search = useRef({ text: '', time: 0 });
  const anchor = useRef({ top: 0, left: 0, bottom: 0 });
  const options = optionsOf(children), enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const selected = options.findIndex(option => option.value === value);
  const initial = enabled.includes(selected) ? selected : enabled[0] ?? -1;
  const isDisabled = disabled || !enabled.length;

  const close = () => { setOpen(false); search.current.text = ''; };
  const choose = (index: number) => {
    const field = native.current, option = options[index];
    if (field && option && !option.disabled && !field.matches(':disabled')) {
      if (field.value !== option.value) {
        field.value = option.value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setInvalid(false);
    }
    close();
  };
  const show = (index = initial) => {
    if (native.current?.matches(':disabled') || isDisabled) return;
    setPosition(undefined); setActive(index); setOpen(true);
  };

  useEffect(() => { if (isDisabled) setOpen(false); }, [isDisabled]);
  useEffect(() => { setInvalid(false); }, [value]);
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect(), edge = 16, gap = 8;
    anchor.current = { top: rect.top, left: rect.left, bottom: rect.bottom };
    const viewportWidth = document.documentElement.clientWidth, viewportHeight = window.innerHeight;
    const width = Math.min(Math.max(rect.width, 240), viewportWidth - edge * 2);
    const below = viewportHeight - rect.bottom - edge - gap, above = rect.top - edge - gap;
    const up = below < Math.min(320, options.length * 44 + 16) && above > below;
    setPosition({ width, left: Math.max(edge, Math.min(rect.left, viewportWidth - width - edge)), maxHeight: Math.max(44, Math.min(320, up ? above : below)),
      ...(up ? { bottom: viewportHeight - rect.top + gap, transformOrigin: 'bottom' } : { top: rect.bottom + gap, transformOrigin: 'top' }) });
  }, [open, options.length]);
  useLayoutEffect(() => {
    const list = menu.current, option = list?.querySelector<HTMLElement>(`[data-option-index="${active}"]`);
    if (!open || !list || !option) return;
    const top = option.offsetTop, bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [open, active, position]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) choose(active);
    };
    const scroll = (event: Event) => {
      if (menu.current?.contains(event.target as Node)) return;
      const rect = trigger.current?.getBoundingClientRect();
      // A focus/scrollIntoView event may arrive after opening at the new position.
      if (!rect || Math.abs(rect.top - anchor.current.top) > 1 || Math.abs(rect.left - anchor.current.left) > 1 || Math.abs(rect.bottom - anchor.current.bottom) > 1) setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  });

  const keyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { if (open) choose(active); return; }
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault(); if (open) choose(active); else show(); return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      if (event.altKey && event.key === 'ArrowUp') { if (open) choose(active); return; }
      const current = Math.max(0, enabled.indexOf(open ? active : initial));
      const step = event.key.startsWith('Page') ? 10 : 1;
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
        : !open ? current : Math.max(0, Math.min(enabled.length - 1, current + (['ArrowDown', 'PageDown'].includes(event.key) ? step : -step)));
      if (!open) show(enabled[index]); else setActive(enabled[index]);
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const key = event.key.toLocaleLowerCase('ru'), fresh = Date.now() - search.current.time > 700;
    const typed = fresh ? key : search.current.text + key;
    const repeated = [...typed].every(char => char === key), query = repeated ? key : typed;
    search.current = { text: typed, time: Date.now() };
    const start = Math.max(0, enabled.indexOf(open ? active : initial)) + (fresh || repeated ? 1 : 0);
    const match = enabled.map((_, offset) => enabled[(start + offset) % enabled.length])
      .find(index => options[index].text.trim().toLocaleLowerCase('ru').startsWith(query));
    if (!open) show(match ?? initial); else if (match !== undefined) setActive(match);
  };

  const describedBy = [props['aria-describedby'], invalid && errorId].filter(Boolean).join(' ') || undefined;
  return <span className="portal-select">
    <select {...props} id={`${controlId}-native`} className="portal-select-native" ref={native} value={value} disabled={disabled} required={required} tabIndex={-1} aria-hidden="true"
      onChange={event => { setInvalid(false); onChange?.(event); }}
      onInvalid={event => {
        onInvalid?.(event); event.preventDefault(); setInvalid(true);
        if (!event.currentTarget.form || event.currentTarget.form.querySelector(':invalid') === event.currentTarget) trigger.current?.focus();
      }}>{children}</select>
    <button type="button" id={controlId} ref={trigger} role="combobox" className={`portal-select-trigger ${className}`} disabled={isDisabled}
      aria-label={props['aria-label'] || label} aria-labelledby={props['aria-labelledby']} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined} aria-required={required || undefined} aria-invalid={props['aria-invalid'] || invalid || undefined} aria-describedby={describedBy}
      onClick={() => open ? close() : show()} onKeyDown={keyboard} onBlur={event => { if (open && event.relatedTarget && !menu.current?.contains(event.relatedTarget as Node)) choose(active); }}>
      <span className={'portal-select-value' + (value === '' ? ' is-placeholder' : '')}>{options[selected]?.text || label}</span><CaretDown size={18} className="portal-select-caret" aria-hidden="true" />
    </button>
    {invalid && <span id={errorId} className="portal-select-error">Выберите значение из списка.</span>}
    {open && createPortal(<div ref={menu} role="listbox" id={listId} aria-label={label} className="portal-select-menu" style={{ ...position, visibility: position ? 'visible' : 'hidden' }}>
      {options.map((option, index) => <div key={`${option.value}-${index}`} id={`${listId}-${index}`} role="option" aria-selected={index === selected} aria-disabled={option.disabled || undefined}
        data-option-index={index} data-active={index === active || undefined} className="portal-select-option"
        onPointerDown={event => event.preventDefault()} onPointerMove={event => { if (event.pointerType === 'mouse' && !option.disabled) setActive(index); }} onClick={() => { if (!option.disabled) choose(index); }}>
        <span>{option.text}</span>{index === selected && <Check size={18} weight="bold" aria-hidden="true" />}
      </div>)}
    </div>, document.body)}
  </span>;
}
