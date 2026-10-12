-- Achievement reports have a separate 10-second interval; other forms remain at 150 seconds.
create table private.achievement_submission_cooldowns (
  user_id uuid primary key,
  reserved_at timestamptz not null,
  request_id uuid not null
);
alter table private.achievement_submission_cooldowns enable row level security;
revoke all on private.achievement_submission_cooldowns from public, anon, authenticated;

create or replace function public.claim_achievement_submission(p_user_id uuid, p_request_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_reserved_at timestamptz; v_remaining integer;
begin
  if p_user_id is null or p_request_id is null then raise exception 'Missing cooldown identity'; end if;
  insert into private.achievement_submission_cooldowns(user_id, reserved_at, request_id)
  values (p_user_id, statement_timestamp(), p_request_id)
  on conflict(user_id) do update
    set reserved_at = excluded.reserved_at, request_id = excluded.request_id
    where private.achievement_submission_cooldowns.reserved_at <= excluded.reserved_at - interval '10 seconds'
  returning reserved_at into v_reserved_at;
  if found then return 0; end if;
  select greatest(1, least(10, ceil(extract(epoch from reserved_at + interval '10 seconds' - statement_timestamp()))::integer))
    into v_remaining from private.achievement_submission_cooldowns where user_id = p_user_id;
  return coalesce(v_remaining, 1);
end;
$$;

create or replace function public.release_achievement_submission(p_user_id uuid, p_request_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.achievement_submission_cooldowns where user_id = p_user_id and request_id = p_request_id;
$$;

-- Six reports per minute are possible, with a bounded allowance for corrections.
-- Retain the existing shared 120-attempt/minute ceiling across all forms.
create or replace function public.claim_achievement_attempt(p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_start timestamptz; v_count integer; v_bucket text; v_limit integer;
begin
  if p_user_id is null then raise exception 'Missing request identity'; end if;
  foreach v_bucket in array array['achievement-user:' || p_user_id::text, 'global'] loop
    v_limit := case when v_bucket = 'global' then 120 else 12 end;
    insert into public.application_request_limits(bucket, window_started_at, attempts)
      values(v_bucket, v_now, 0) on conflict(bucket) do nothing;
    select window_started_at, attempts into v_start, v_count
      from public.application_request_limits where bucket = v_bucket for update;
    if v_start <= v_now - interval '60 seconds' then
      v_start := v_now; v_count := 0;
      update public.application_request_limits set window_started_at = v_now, attempts = 0, blocked = 0 where bucket = v_bucket;
    end if;
    if v_count >= v_limit then
      update public.application_request_limits set blocked = least(blocked::bigint + 1, 2147483647)::integer where bucket = v_bucket;
      return greatest(1, least(60, ceil(extract(epoch from v_start + interval '60 seconds' - v_now))::integer));
    end if;
    update public.application_request_limits set attempts = attempts + 1 where bucket = v_bucket;
  end loop;
  return 0;
end;
$$;

revoke all on function public.claim_achievement_submission(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_achievement_submission(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_achievement_attempt(uuid) from public, anon, authenticated;
grant execute on function public.claim_achievement_submission(uuid, uuid) to service_role;
grant execute on function public.release_achievement_submission(uuid, uuid) to service_role;
grant execute on function public.claim_achievement_attempt(uuid) to service_role;
notify pgrst, 'reload schema';
