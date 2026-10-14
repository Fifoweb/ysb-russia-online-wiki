-- Use Supabase Auth's persisted, automatically renewed login without a second
-- application-specific session lifetime or auth.sessions lookup.
-- Keep this RPC for older deployed clients/functions during the rollout.
create or replace function public.is_site_session_active()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null;
$$;
revoke all on function public.is_site_session_active() from public, anon, authenticated;
grant execute on function public.is_site_session_active() to authenticated;

alter policy "own profile" on public.profiles to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
alter policy "own bookmarks" on public.bookmarks to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own favorites" on public.favorites to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
