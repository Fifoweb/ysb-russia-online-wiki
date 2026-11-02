import { emptyProfile, type Profile } from './profileData';

export interface ProfileSnapshot {
  userId: string | null;
  profile: Profile;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string;
}

export function createProfileStore(api: { load: (id: string) => Promise<Profile>; save: (id: string, profile: Profile) => Promise<Profile> }) {
  let snapshot: ProfileSnapshot = { userId: null, profile: emptyProfile, status: 'idle', error: '' };
  let revision = 0;
  let loadedAt = 0;
  const listeners = new Set<() => void>();
  const publish = (next: ProfileSnapshot) => { snapshot = next; listeners.forEach(notify => notify()); };
  const reload = async (userId: string) => {
    if (snapshot.userId !== userId) return;
    const operation = ++revision;
    publish({ ...snapshot, status: 'loading', error: '' });
    try {
      const profile = await api.load(userId);
      if (revision === operation && snapshot.userId === userId) {
        loadedAt = Date.now();
        publish({ userId, profile, status: 'ready', error: '' });
      }
    } catch {
      if (revision === operation && snapshot.userId === userId) {
        publish({ ...snapshot, status: 'error', error: 'Не удалось загрузить профиль. Попробуйте ещё раз.' });
      }
    }
  };
  return {
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    getSnapshot: () => snapshot,
    activate(userId: string | null) {
      if (snapshot.userId === userId) {
        if (userId && snapshot.status === 'ready' && Date.now() - loadedAt > 60_000) void reload(userId);
        return;
      }
      revision++;
      loadedAt = 0;
      publish({ userId, profile: emptyProfile, status: userId ? 'loading' : 'idle', error: '' });
      if (userId) void reload(userId);
    },
    reload,
    async save(userId: string, profile: Profile) {
      if (snapshot.userId !== userId) throw new Error('Аккаунт изменился. Откройте личный кабинет ещё раз.');
      const operation = ++revision;
      const saved = await api.save(userId, profile);
      if (revision !== operation || snapshot.userId !== userId) throw new Error('Аккаунт изменился. Откройте личный кабинет ещё раз.');
      loadedAt = Date.now();
      publish({ userId, profile: saved, status: 'ready', error: '' });
      return saved;
    },
  };
}
