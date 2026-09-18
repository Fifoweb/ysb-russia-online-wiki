import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Auth activates only when real credentials are placed into .env
export const isSupabaseConfigured = Boolean(
  url && key && url.startsWith('https://') && !url.includes('YOUR-PROJECT') && !key.includes('YOUR')
);

export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null;
