-- One successful application per Supabase user across every submission function.
create table if not exists public.application_submission_cooldowns (
  user_id uuid primary key,
  reserved_at timestamptz not null,
  request_id uuid not null
);

alter table public.application_submission_cooldowns enable row level security;
revoke all on public.application_submission_cooldowns from public, anon, authenticated;

create or replace function public.claim_application_submission(p_user_id uuid, p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved_at timestamptz;
  v_remaining integer;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'Missing cooldown identity';
  end if;

  insert into public.application_submission_cooldowns (user_id, reserved_at, request_id)
  values (p_user_id, statement_timestamp(), p_request_id)
  on conflict (user_id) do update
    set reserved_at = excluded.reserved_at, request_id = excluded.request_id
    where public.application_submission_cooldowns.reserved_at <= excluded.reserved_at - interval '60 seconds'
  returning reserved_at into v_reserved_at;

  if found then
    return 0;
  end if;

  select greatest(1, least(60, ceil(extract(epoch from reserved_at + interval '60 seconds' - statement_timestamp()))::integer))
    into v_remaining
    from public.application_submission_cooldowns
    where user_id = p_user_id;
  return coalesce(v_remaining, 1);
end;
$$;

create or replace function public.release_application_submission(p_user_id uuid, p_request_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.application_submission_cooldowns
  where user_id = p_user_id and request_id = p_request_id;
$$;

revoke all on function public.claim_application_submission(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_application_submission(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_application_submission(uuid, uuid) to service_role;
grant execute on function public.release_application_submission(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
