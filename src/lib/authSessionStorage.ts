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
  const volatile = new Set<string>();
  const clearLegacyTokens = () => {
    for (const storage of [persistentStorage, tabStorage]) {
      for (const key of legacyKeys) {
        try { storage?.removeItem(key); } catch { /* Storage may be blocked by the browser. */ }
      }
    }
  };
  const writeSafe = (key: string, safe: string) => {
    memory.set(key, safe);
    if (key === sessionKey) {
      try {
        if (persistentStorage) {
          persistentStorage.setItem(key, safe);
          volatile.delete(key);
          try { tabStorage?.removeItem(key); } catch { /* Legacy tab cache may be blocked. */ }
          return;
        }
      } catch { /* Fall back to this tab when persistent storage is unavailable. */ }
    }
    volatile.add(key);
    try { tabStorage?.setItem(key, safe); } catch { /* Keep the sanitized value in memory. */ }
    try { persistentStorage?.removeItem(key); } catch { /* Remove stale credentials where possible. */ }
  };
  const storage = {
    getItem(key: string): string | null {
      let raw: string | null = volatile.has(key) ? memory.get(key) ?? null : null;
      const primary = key === sessionKey ? persistentStorage : tabStorage;
      const fallback = key === sessionKey ? tabStorage : persistentStorage;
      let readable = false;
      if (raw === null) try { if (primary) { raw = primary.getItem(key); readable = true; } }
      catch { /* Try the old tab cache or memory. */ }
      if (raw === null) {
        try { if (fallback) { raw = fallback.getItem(key); readable = true; } }
        catch { /* The fallback may also be blocked. */ }
      }
      if (raw === null && !readable) raw = memory.get(key) ?? null;
      const safe = key === sessionKey ? sanitizeSession(raw) : raw;
      if (safe === null) storage.removeItem(key); else writeSafe(key, safe);
      return safe;
    },
    setItem(key: string, value: string) {
      const safe = key === sessionKey ? sanitizeSession(value) : value;
      if (safe === null) { storage.removeItem(key); return; }
      writeSafe(key, safe);
    },
    removeItem(key: string) {
      memory.delete(key);
      volatile.delete(key);
      try { tabStorage?.removeItem(key); } catch { /* Keep sign-out working in memory. */ }
      try { persistentStorage?.removeItem(key); } catch { /* Keep sign-out working in memory. */ }
    },
    clearLegacyTokens,
    syncPersistentSession() {
      memory.delete(sessionKey);
      volatile.delete(sessionKey);
      try { tabStorage?.removeItem(sessionKey); } catch { /* Do not revive an old tab session. */ }
      storage.getItem(sessionKey);
    },
  };
  clearLegacyTokens();
  storage.getItem(sessionKey);
  return storage;
}

export function createBrowserAuthStorage(sessionKey: string) {
  let persistentStorage: StorageLike | null = null;
  let tabStorage: StorageLike | null = null;
  if (typeof window !== 'undefined') {
    // Remove Discord provider credentials before Supabase processes the OAuth callback.
    // Only the site's session is persisted. Discord provider tokens are discarded.
    const callback = new URL(window.location.href);
    if (removeProviderTokensFromUrl(callback)) window.history.replaceState(window.history.state, '', callback.href);
    try { persistentStorage = window.localStorage; } catch { /* Use memory when storage is blocked. */ }
    try { tabStorage = window.sessionStorage; } catch { /* No legacy cache is accessible. */ }
  }
  const storage = createAuthStorage(sessionKey, persistentStorage, tabStorage);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', event => {
      if (event.key === sessionKey || event.key === null) {
        storage.syncPersistentSession();
      }
      if (event.key === sessionKey || event.key === null || legacyKeys.includes(event.key ?? '')) {
        storage.clearLegacyTokens();
        storage.getItem(sessionKey);
      }
    });
    window.addEventListener('pageshow', storage.clearLegacyTokens);
  }
  return storage;
}
