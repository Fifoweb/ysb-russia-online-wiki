import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from './auth';
import { loadProfile, saveProfile } from './profile';
import { emptyProfile, type Profile } from './profileData';
import { createProfileStore } from './profileStore';

const store = createProfileStore({ load: loadProfile, save: saveProfile });

export function useProfile() {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const userId = user?.id ?? null;
  useEffect(() => { store.activate(userId); }, [userId]);
  const visible = snapshot.userId === userId;
  return {
    profile: visible ? snapshot.profile : emptyProfile,
    status: visible ? snapshot.status : userId ? 'loading' as const : 'idle' as const,
    error: visible ? snapshot.error : '',
    refresh: () => userId ? store.reload(userId) : Promise.resolve(),
    save: (profile: Profile) => userId ? store.save(userId, profile) : Promise.reject(new Error('Войдите через Discord.')),
  };
}
