import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { withoutProviderTokens } from './authSessionStorage';

// Every form and the header read the same snapshot, including during token renewal.
let snapshot: { session: Session | null; loading: boolean } = { session: null, loading: isSupabaseConfigured };
const listeners = new Set<() => void>();
let started = false;
let revision = 0;
let identityRevision = 0;

function publishSession(session: Session | null) {
  if (snapshot.session?.user.id !== session?.user.id) identityRevision++;
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

type ApplicationSession = { session: Session; error?: never; status?: never } |
  { session?: never; error: string; status: 401 | 409 | 503 };

// Recover a site session before the single submission POST. Never use a Discord
// provider token or let the SDK substitute the anonymous API key as the user.
export async function getApplicationSession(userId: string): Promise<ApplicationSession> {
  if (!supabase) return { error: 'Сервис временно недоступен. Попробуйте позже.', status: 503 };
  const client = supabase;
  const cached = snapshot.session;
  const initialIdentity = identityRevision;
  const changedAccount = () => identityRevision !== initialIdentity;
  const accountError = (): ApplicationSession => ({ error: 'Аккаунт изменился. Проверьте вход и отправьте форму ещё раз.', status: 409 });
  const expired = async (): Promise<ApplicationSession> => {
    if (!changedAccount()) {
      revision++;
      publishSession(null);
      try { await client.auth.signOut({ scope: 'local' }); } catch { /* Local UI is already signed out. */ }
    }
    return { error: 'Вход больше не действует. Войдите через Discord ещё раз.', status: 401 };
  };
  const unavailable = (): ApplicationSession => ({ error: 'Не удалось проверить вход. Попробуйте отправить форму чуть позже.', status: 503 });
  const invalidSession = (error: { status?: number; name?: string }) =>
    error.name !== 'AuthRetryableFetchError' && [400, 401, 403].includes(error.status ?? 0);
  if (cached && cached.user.id !== userId) return accountError();
  try {
    const current = await client.auth.getSession();
    if (current.error) return invalidSession(current.error) ? await expired() : unavailable();
    if (changedAccount()) return accountError();
    let session = current.data.session;
    if (session && session.user.id !== userId) {
      publishSession(session);
      return accountError();
    }
    if (!session || !session.expires_at || session.expires_at <= Math.floor(Date.now() / 1000) + 30) {
      const source = session ?? cached;
      if (source?.user.id !== userId || !source.refresh_token) return await expired();
      const renewed = await client.auth.refreshSession({ refresh_token: source.refresh_token });
      if (renewed.error) return invalidSession(renewed.error) ? await expired() : unavailable();
      if (changedAccount()) return accountError();
      session = renewed.data.session;
    }
    if (!session?.access_token || !session.expires_at || session.expires_at <= Math.floor(Date.now() / 1000)) return await expired();
    if (session.user.id !== userId) return accountError();
    return { session: withoutProviderTokens(session) };
  } catch { return unavailable(); }
}

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
    // Invalidate an in-flight recovery immediately when the user clicks logout.
    revision++;
    identityRevision++;
    publishSession(null);
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
