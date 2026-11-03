import { getApplicationSession } from './auth';
import { supabase } from './supabase';

export const VACATIONS_CHANGED = 'vacations-changed';
export async function endVacation(userId: string, id: string): Promise<string> {
  const client = supabase;
  if (!client) throw new Error('Сервис временно недоступен. Попробуйте позже.');
  const auth = await getApplicationSession(userId);
  if (!auth.session) throw new Error(auth.error);
  const { data, error } = await Promise.resolve(client.rpc('end_my_vacation', { p_id: id })).catch(() => ({ data: null, error: true }));
  if (error) throw new Error('Не удалось завершить отпуск. Обновите список и попробуйте ещё раз.');
  if (data?.status === 'not_found') throw new Error('Отпуск не найден. Обновите личный кабинет.');
  if (data?.status === 'not_active') throw new Error('Завершить досрочно можно только действующий отпуск. Обновите список.');
  if (data?.status !== 'ended' || data.id !== id || typeof data.returned_at !== 'string' || !Number.isFinite(Date.parse(data.returned_at))) {
    throw new Error('Не удалось подтвердить завершение. Обновите список перед повторной попыткой.');
  }
  // No personal data is broadcast: other tabs only receive an invalidation tick.
  try { localStorage.setItem(VACATIONS_CHANGED, String(Date.now())); } catch { /* Refresh still works in this tab. */ }
  window.dispatchEvent(new Event(VACATIONS_CHANGED));
  return data.returned_at;
}
