import { useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from './auth';
import { useProfile } from './useProfile';
import { applyProfileDefaults, type ProfileMapping } from './profileData';

// Defaults are derived at render time. A slow profile response cannot overwrite
// a field the user has already edited, including a deliberately cleared value.
export function useProfileForm<T extends object>(initial: T | (() => T), mapping: ProfileMapping<T>) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const userId = user?.id ?? null;
  const create = () => ({ userId, values: typeof initial === 'function' ? (initial as () => T)() : initial, touched: [] as (keyof T)[] });
  const [draft, setDraft] = useState(create);
  const visible = draft.userId === userId ? draft : create();
  const values = applyProfileDefaults(visible.values, visible.touched, profile, mapping);
  const setValues: Dispatch<SetStateAction<T>> = action => setDraft(previous => {
    const current = previous.userId === userId ? previous : create();
    const before = applyProfileDefaults(current.values, current.touched, profile, mapping);
    const next = typeof action === 'function' ? (action as (value: T) => T)(before) : action;
    const edited = (Object.keys(mapping) as (keyof T)[]).filter(key => before[key] !== next[key]);
    return { userId, values: next, touched: [...new Set([...current.touched, ...edited])] };
  });
  return [values, setValues, () => setDraft(create())] as const;
}
