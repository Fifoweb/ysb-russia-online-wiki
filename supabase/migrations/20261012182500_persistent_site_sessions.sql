-- Keep live sessions until explicit logout or Supabase revocation; preserve ownership and revocation checks.
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
  return exists(
    select 1 from auth.sessions s
    where s.id=v_session_id::uuid and s.user_id=v_user_id
      and (s.not_after is null or s.not_after > statement_timestamp())
  );
end;
$$;
revoke all on function public.is_site_session_active() from public, anon, authenticated;
grant execute on function public.is_site_session_active() to authenticated;
notify pgrst, 'reload schema';
