import { createClient, type Session } from '@supabase/supabase-js';
import { createBrowserAuthStorage, withoutProviderTokens } from './authSessionStorage';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Auth activates only when real credentials are placed into .env
export const isSupabaseConfigured = Boolean(
  url && key && url.startsWith('https://') && !url.includes('YOUR-PROJECT') && !key.includes('YOUR')
);

let authStorage: ReturnType<typeof createBrowserAuthStorage> | null = null;
let storageKey = '';

function createAuthClient() {
  if (!isSupabaseConfigured) return null;
  // Match Supabase's existing key so current users keep their site sessions.
  storageKey = `sb-${new URL(url!).hostname.split('.')[0]}-auth-token`;
  authStorage = createBrowserAuthStorage(storageKey);
  return createClient(url!, key!, {
    auth: { storageKey, storage: authStorage, persistSession: true, autoRefreshToken: true },
  });
}

export const supabase = createAuthClient();

// Display the saved login during a temporary refresh outage. This cache is only
// for the UI: every submission still needs a renewed token and server auth.
export function readCachedSiteSession(): Session | null {
  try {
    const raw = authStorage?.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.access_token !== 'string' || !value.access_token ||
      typeof value.refresh_token !== 'string' || !value.refresh_token ||
      typeof value.user?.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.user.id) ||
      typeof value.expires_at !== 'number' || !Number.isFinite(value.expires_at)) return null;
    return withoutProviderTokens(value as Session);
  } catch { return null; }
}
