-- Supabase's built-in session timeouts require Pro. Enforce access to this site's
-- data and applications independently; do not expose auth.sessions or tokens.
create or replace function public.is_site_session_active()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := auth.jwt() ->> 'session_id';
begin
  if v_user_id is null or v_session_id is null or
    v_session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from auth.sessions s
    where s.id = v_session_id::uuid and s.user_id = v_user_id
      and s.created_at > statement_timestamp() - interval '8 hours'
      and coalesce(s.refreshed_at, s.created_at) > statement_timestamp() - interval '30 minutes'
      and (s.not_after is null or s.not_after > statement_timestamp())
  );
end;
$$;
revoke all on function public.is_site_session_active() from public, anon, authenticated;
grant execute on function public.is_site_session_active() to authenticated;

alter policy "own profile" on public.profiles to authenticated
  using ((select public.is_site_session_active()) and auth.uid() = id)
  with check ((select public.is_site_session_active()) and auth.uid() = id);
alter policy "own bookmarks" on public.bookmarks to authenticated
  using ((select public.is_site_session_active()) and auth.uid() = user_id)
  with check ((select public.is_site_session_active()) and auth.uid() = user_id);
alter policy "own favorites" on public.favorites to authenticated
  using ((select public.is_site_session_active()) and auth.uid() = user_id)
  with check ((select public.is_site_session_active()) and auth.uid() = user_id);

revoke truncate, references, trigger on public.profiles, public.bookmarks, public.favorites from anon, authenticated;
notify pgrst, 'reload schema';
