export type VacationRow = { display_name: string; department: string; starts_at: string; ends_at: string };
export const vacationDate = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));
export const moscowToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
export const vacationTimestamp = (date: string, time: string) => Date.parse(`${date}T${time}:00+03:00`);
export function vacationPeriodError(start: string, end: string, startTime: string, endTime: string, now = Date.now()) {
  if (!start || !end) return 'Выберите начало и окончание на календаре.';
  const a = vacationTimestamp(start, startTime), b = vacationTimestamp(end, endTime);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'Укажите время начала и окончания.';
  if (a < now - 60_000) return 'Начало отпуска должно быть в будущем. Уточните время.';
  if (b <= a) return 'Окончание должно быть позже начала.';
  if (b - a > 366 * 86400000) return 'Выберите период не длиннее одного года.';
  return '';
}
export function vacationDuration(start: number, end: number) {
  const minutes = Math.max(0, Math.ceil((end - start) / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
  return [days ? `${days} дн.` : '', hours ? `${hours} ч.` : '', rest ? `${rest} мин.` : ''].filter(Boolean).join(' ') || 'менее минуты';
}
