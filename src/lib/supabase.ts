import { createClient } from '@supabase/supabase-js';
import { createBrowserAuthStorage } from './authSessionStorage';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Auth activates only when real credentials are placed into .env
export const isSupabaseConfigured = Boolean(
  url && key && url.startsWith('https://') && !url.includes('YOUR-PROJECT') && !key.includes('YOUR')
);

function createAuthClient() {
  if (!isSupabaseConfigured) return null;
  // Match Supabase's existing key so current users keep their site sessions.
  const storageKey = `sb-${new URL(url!).hostname.split('.')[0]}-auth-token`;
  return createClient(url!, key!, {
    auth: { storageKey, storage: createBrowserAuthStorage(storageKey) },
  });
}

export const supabase = createAuthClient();
