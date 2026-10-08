import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { withoutProviderTokens } from './authSessionStorage';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? withoutProviderTokens(data.session) : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ? withoutProviderTokens(nextSession) : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithDiscord = async () => {
    if (!supabase) return;
    // Redirect must include the repo subpath on GitHub Pages (origin alone → 404).
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

  return {
    user: session?.user ?? null,
    session,
    loading,
    signInWithDiscord,
    signOut,
    enabled: isSupabaseConfigured,
  };
}
