import { supabase } from './supabase';

// Structurally matches the Bookmark interface in DocumentEditor
export interface StoredBookmark { name: string; sectionId: number; snapshot?: unknown; }

export interface Profile {
  full_name: string;
  rank: string;
  position: string;
  badge: string;
  about: string;
}

export const emptyProfile: Profile = { full_name: '', rank: '', position: '', badge: '', about: '' };

export async function loadProfile(userId: string): Promise<Profile> {
  if (!supabase) return emptyProfile;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data ? { ...emptyProfile, ...data } : emptyProfile;
}

export async function saveProfile(userId: string, p: Profile): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...p, updated_at: new Date().toISOString() });
  return !error;
}

// One row per (user_id, doc_code); items = bookmark list with text snapshots.
// On first login the local browser bookmarks are migrated into the account.
export async function loadRemoteBookmarks(userId: string, code: string, local: StoredBookmark[]): Promise<StoredBookmark[]> {
  if (!supabase) return local;
  const { data, error } = await supabase
    .from('bookmarks').select('items')
    .eq('user_id', userId).eq('doc_code', code)
    .maybeSingle();
  if (error) return local;
  if (data?.items) return data.items as StoredBookmark[];
  if (local.length) await saveRemoteBookmarks(userId, code, local);
  return local;
}

export async function saveRemoteBookmarks(userId: string, code: string, items: StoredBookmark[]): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('bookmarks')
    .upsert({ user_id: userId, doc_code: code, items, updated_at: new Date().toISOString() });
}

// ── Favorites (handbook articles): one row per user, ids = jsonb array ──

export async function loadRemoteFavorites(userId: string, local: string[]): Promise<string[]> {
  if (!supabase) return local;
  const { data, error } = await supabase
    .from('favorites').select('article_ids')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return local;
  if (data?.article_ids) return data.article_ids as string[];
  if (local.length) await saveRemoteFavorites(userId, local);
  return local;
}

export async function saveRemoteFavorites(userId: string, ids: string[]): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('favorites')
    .upsert({ user_id: userId, article_ids: ids, updated_at: new Date().toISOString() });
}
