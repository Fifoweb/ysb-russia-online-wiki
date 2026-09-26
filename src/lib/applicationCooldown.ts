import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const DURATION_MS = 60_000;
const STORAGE_PREFIX = 'application-cooldown:';
const CHANGE_EVENT = 'application-cooldown-change';
const deadlines = new Map<string, number>();

function readDeadline(userId: string): number {
  if (!userId) return 0;
  try {
    const stored = Number(localStorage.getItem(STORAGE_PREFIX + userId));
    if (Number.isFinite(stored) && stored > Date.now()) return stored;
  } catch {
    // The in-memory timer still works if storage is unavailable.
  }
  return deadlines.get(userId) ?? 0;
}

function setDeadline(userId: string, seconds: number): void {
  if (!userId) return;
  const until = Date.now() + seconds * 1000;
  const next = Math.max(readDeadline(userId), until);
  deadlines.set(userId, next);
  try { localStorage.setItem(STORAGE_PREFIX + userId, String(next)); } catch { /* storage may be disabled */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useApplicationCooldown(userId?: string): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const refresh = () => setRemaining(userId ? Math.max(0, Math.ceil((readDeadline(userId) - Date.now()) / 1000)) : 0);
    refresh();
    const interval = window.setInterval(refresh, 250);
    window.addEventListener('storage', refresh);
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', refresh);
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, [userId]);

  return remaining;
}

export async function invokeApplication(name: string, options: { body: Record<string, unknown> }, userId: string) {
  if (!supabase) throw new Error('Supabase client is unavailable');
  const result = await supabase.functions.invoke(name, options);
  if (!result.error) {
    setDeadline(userId, DURATION_MS / 1000);
  } else {
    const response = (result.error as { context?: Response }).context;
    if (response?.status === 429) {
      const retry = Number(response.headers?.get('Retry-After'));
      setDeadline(userId, Number.isFinite(retry) && retry > 0 ? Math.min(60, retry) : 60);
    }
  }
  return result;
}
