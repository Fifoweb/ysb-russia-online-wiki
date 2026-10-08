import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { withoutProviderTokens } from './authSessionStorage';

// Client-side idle timeout. The access JWT still expires according to Supabase server settings.
const IDLE_MS = 30 * 60 * 1000;
const ACTIVITY_KEY = 'gibdd-auth-last-activity';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? withoutProviderTokens(data.session) : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        try { window.localStorage.removeItem(ACTIVITY_KEY); } catch { /* Private mode */ }
      }
      setSession(nextSession ? withoutProviderTokens(nextSession) : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    let lastActivity = Date.now();
    try {
      const storedActivity = Number(window.localStorage.getItem(ACTIVITY_KEY));
      if (Number.isFinite(storedActivity) && storedActivity > 0) lastActivity = storedActivity;
      else window.localStorage.setItem(ACTIVITY_KEY, String(lastActivity));
    }
    catch { /* In-memory idle tracking still works */ }
    let endingSession = false;
    const getLastActivity = () => {
      try { return Number(window.localStorage.getItem(ACTIVITY_KEY)) || lastActivity; }
      catch { return lastActivity; }
    };
    const checkIdle = () => {
      if (endingSession || Date.now() - getLastActivity() < IDLE_MS) return;
      endingSession = true;
      void supabase!.auth.signOut().then(({ error }) => {
        if (error) endingSession = false; // Retry if sign-out could not complete.
      }).catch(() => { endingSession = false; });
    };
    const recordActivity = () => {
      checkIdle(); // Don't let activity revive a session that already timed out.
      if (endingSession || Date.now() - getLastActivity() < 15_000) return;
      lastActivity = Date.now();
      try { window.localStorage.setItem(ACTIVITY_KEY, String(lastActivity)); }
      catch { /* Private mode */ }
    };
    checkIdle();
    for (const name of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
      window.addEventListener(name, recordActivity, { passive: true });
    }
    const timer = window.setInterval(checkIdle, 60_000);
    const onFocus = () => checkIdle();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      for (const name of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
        window.removeEventListener(name, recordActivity);
      }
    };
  }, [session?.user.id]);

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
