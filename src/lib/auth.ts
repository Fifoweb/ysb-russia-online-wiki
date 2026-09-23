import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';

const discordTokenKey = 'discord_oauth_access_token';
const discordTokenUserKey = 'discord_oauth_user_id';

function discordIdFromSession(session: Session | null) {
  const identity = session?.user.identities?.find((item) => item.provider === 'discord');
  const id = (identity?.identity_data as Record<string, unknown> | null)?.sub;
  return typeof id === 'string' ? id : null;
}

function readDiscordProviderToken(session: Session | null) {
  const discordId = discordIdFromSession(session);
  if (!discordId || typeof window === 'undefined') return null;
  try {
    if (window.sessionStorage.getItem(discordTokenUserKey) !== discordId) return null;
    return window.sessionStorage.getItem(discordTokenKey);
  } catch {
    return null;
  }
}

// Capture the short-lived provider token at OAuth callback time; Supabase only
// emits it once, while the session is used later to check the user's Discord role.
if (supabase && typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    try {
      if (event === 'SIGNED_OUT') {
        window.sessionStorage.removeItem(discordTokenKey);
        window.sessionStorage.removeItem(discordTokenUserKey);
        return;
      }
      if (session?.provider_token) {
        const discordId = discordIdFromSession(session);
        if (!discordId) return;
        window.sessionStorage.setItem(discordTokenUserKey, discordId);
        window.sessionStorage.setItem(discordTokenKey, session.provider_token);
      }
    } catch {
      // Role checks will prompt the user to reauthorize if session storage is unavailable.
    }
  });
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [providerToken, setProviderToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setProviderToken(data.session?.provider_token ?? readDiscordProviderToken(data.session));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProviderToken(nextSession?.provider_token ?? readDiscordProviderToken(nextSession));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithDiscord = async (scopes = 'identify') => {
    if (!supabase) return;
    // Redirect must include the repo subpath on GitHub Pages (origin alone → 404).
    // identify is the default; role-gated forms request member-read access explicitly.
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
        scopes,
      },
    });
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return {
    user: session?.user ?? null,
    session,
    providerToken,
    loading,
    signInWithDiscord,
    signOut,
    enabled: isSupabaseConfigured,
  };
}
