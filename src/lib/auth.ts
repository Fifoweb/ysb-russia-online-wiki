import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithDiscord = async () => {
    if (!supabase) return;
    // Redirect must include the repo subpath on GitHub Pages (origin alone → 404).
    // scopes: 'identify' only — no email required, so Discord accounts without
    // a verified email can still sign in.
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
        scopes: 'identify',
      },
    });
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return { user, loading, signInWithDiscord, signOut, enabled: isSupabaseConfigured };
}
