import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { withoutProviderTokens } from './authSessionStorage';

// Every form and the header read the same snapshot, including during token renewal.
let snapshot: { session: Session | null; loading: boolean } = { session: null, loading: isSupabaseConfigured };
const listeners = new Set<() => void>();
let started = false;
let revision = 0;

function publishSession(session: Session | null) {
  snapshot = { session: session ? withoutProviderTokens(session) : null, loading: false };
  listeners.forEach(notify => notify());
}

function startAuth() {
  if (started || !supabase) return;
  started = true;
  const initialRevision = revision;
  supabase.auth.onAuthStateChange((event, nextSession) => {
    // A delayed initial read must not undo a newer login, renewal or logout.
    if (event === 'INITIAL_SESSION' && !snapshot.loading) return;
    revision++;
    publishSession(nextSession);
  });
  void supabase.auth.getSession().then(({ data }) => {
    if (revision !== initialRevision) return;
    publishSession(data.session);
  }).catch(() => {
    if (revision === initialRevision) publishSession(snapshot.session);
  });
}

function subscribeAuth(notify: () => void) {
  listeners.add(notify);
  startAuth();
  return () => { listeners.delete(notify); };
}
const getAuthSnapshot = () => snapshot;

export function useAuth() {
  const { session, loading } = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);

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
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
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
