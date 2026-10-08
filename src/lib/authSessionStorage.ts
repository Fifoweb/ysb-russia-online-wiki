type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const legacyKeys = ['discord_oauth_access_token', 'discord_oauth_user_id'];
const providerKeys = ['provider_token', 'provider_refresh_token'] as const;

export function withoutProviderTokens<T extends object>(session: T): T {
  const safe = { ...session };
  for (const key of providerKeys) delete (safe as Record<string, unknown>)[key];
  return safe;
}

function sanitizeSession(value: string | null): string | null {
  if (value === null) return null;
  try {
    const session: unknown = JSON.parse(value);
    if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
    return providerKeys.some(key => key in session)
      ? JSON.stringify(withoutProviderTokens(session)) : value;
  } catch { return null; }
}

export function removeProviderTokensFromUrl(url: URL): boolean {
  const hash = new URLSearchParams(url.hash.slice(1));
  let changed = false;
  let hashChanged = false;
  for (const key of providerKeys) {
    if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; }
    if (hash.has(key)) { hash.delete(key); changed = true; hashChanged = true; }
  }
  if (hashChanged) url.hash = hash.toString();
  return changed;
}

export function createAuthStorage(
  sessionKey: string, persistentStorage: StorageLike | null, tabStorage: StorageLike | null,
) {
  const memory = new Map<string, string>();
  const clearLegacyTokens = () => {
    for (const storage of [persistentStorage, tabStorage]) {
      for (const key of legacyKeys) {
        try { storage?.removeItem(key); } catch { /* Storage may be blocked by the browser. */ }
      }
    }
  };
  const storage = {
    getItem(key: string): string | null {
      let raw: string | null;
      try { raw = persistentStorage ? persistentStorage.getItem(key) : memory.get(key) ?? null; }
      catch { raw = memory.get(key) ?? null; }
      const safe = key === sessionKey ? sanitizeSession(raw) : raw;
      if (safe === null) memory.delete(key); else memory.set(key, safe);
      if (raw !== safe) {
        try {
          if (safe === null) persistentStorage?.removeItem(key);
          else persistentStorage?.setItem(key, safe);
        } catch { /* The returned session is sanitized even if persistent storage is unavailable. */ }
      }
      return safe;
    },
    setItem(key: string, value: string) {
      const safe = key === sessionKey ? sanitizeSession(value) : value;
      if (safe === null) { storage.removeItem(key); return; }
      memory.set(key, safe);
      try { persistentStorage?.setItem(key, safe); } catch { /* Keep the session in memory. */ }
    },
    removeItem(key: string) {
      memory.delete(key);
      try { persistentStorage?.removeItem(key); } catch { /* Keep sign-out working in memory. */ }
    },
    clearLegacyTokens,
  };
  clearLegacyTokens();
  storage.getItem(sessionKey);
  return storage;
}

export function createBrowserAuthStorage(sessionKey: string) {
  let persistentStorage: StorageLike | null = null;
  let tabStorage: StorageLike | null = null;
  if (typeof window !== 'undefined') {
    // Remove only Discord credentials before Supabase processes the OAuth callback.
    // Its own access/refresh tokens and the GitHub Pages redirect path stay intact.
    const callback = new URL(window.location.href);
    if (removeProviderTokensFromUrl(callback)) window.history.replaceState(window.history.state, '', callback.href);
    try { persistentStorage = window.localStorage; } catch { /* Use memory when storage is blocked. */ }
    try { tabStorage = window.sessionStorage; } catch { /* No legacy cache is accessible. */ }
  }
  const storage = createAuthStorage(sessionKey, persistentStorage, tabStorage);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', event => {
      if (event.key === sessionKey || legacyKeys.includes(event.key ?? '')) {
        storage.clearLegacyTokens();
        storage.getItem(sessionKey);
      }
    });
    window.addEventListener('pageshow', storage.clearLegacyTokens);
  }
  return storage;
}
