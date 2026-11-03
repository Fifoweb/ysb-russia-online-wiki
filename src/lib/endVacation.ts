import { getApplicationSession } from './auth';
import { supabase } from './supabase';

export const VACATIONS_CHANGED = 'vacations-changed';
async function changeVacation(userId: string, id: string, cancel: boolean): Promise<string> {
  const client = supabase;
  if (!client) throw new Error('Сервис временно недоступен. Попробуйте позже.');
  const auth = await getApplicationSession(userId);
  if (!auth.session) throw new Error(auth.error);
  const { data, error } = await Promise.resolve(client.rpc(cancel ? 'cancel_my_vacation' : 'end_my_vacation', { p_id: id })).catch(() => ({ data: null, error: true }));
  if (error) throw new Error(cancel ? 'Не удалось отменить отпуск. Обновите список и попробуйте ещё раз.' : 'Не удалось завершить отпуск. Обновите список и попробуйте ещё раз.');
  if (data?.status === 'not_found') throw new Error('Отпуск не найден. Обновите личный кабинет.');
  if (data?.status === 'not_active') throw new Error('Завершить досрочно можно только действующий отпуск. Обновите список.');
  if (data?.status === 'not_upcoming') throw new Error('Отменить можно только отпуск, который ещё не начался. Обновите список.');
  const changedAt = cancel ? data?.cancelled_at : data?.returned_at;
  if (data?.status !== (cancel ? 'cancelled' : 'ended') || data.id !== id || typeof changedAt !== 'string' || !Number.isFinite(Date.parse(changedAt))) {
    throw new Error('Не удалось подтвердить изменение. Обновите список перед повторной попыткой.');
  }
  // No personal data is broadcast: other tabs only receive an invalidation tick.
  try { localStorage.setItem(VACATIONS_CHANGED, String(Date.now())); } catch { /* Refresh still works in this tab. */ }
  window.dispatchEvent(new Event(VACATIONS_CHANGED));
  return changedAt;
}
export const endVacation = (userId: string, id: string) => changeVacation(userId, id, false);
export const cancelVacation = (userId: string, id: string) => changeVacation(userId, id, true);
