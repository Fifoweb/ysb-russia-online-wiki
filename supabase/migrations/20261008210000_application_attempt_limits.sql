-- Counts all authenticated attempts, including invalid input and failed delivery.
create table if not exists public.application_request_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts >= 0),
  blocked integer not null default 0 check (blocked >= 0)
);
alter table public.application_request_limits enable row level security;
revoke all on public.application_request_limits from public, anon, authenticated;

create or replace function public.claim_application_attempt(p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := statement_timestamp();
  v_start timestamptz;
  v_count integer;
  v_bucket text;
  v_limit integer;
begin
  if p_user_id is null then raise exception 'Missing request identity'; end if;
  -- Always lock the user's bucket first, then the shared bucket.
  foreach v_bucket in array array['user:' || p_user_id::text, 'global'] loop
    v_limit := case when v_bucket = 'global' then 120 else 5 end;
    insert into public.application_request_limits (bucket, window_started_at, attempts)
      values (v_bucket, v_now, 0) on conflict (bucket) do nothing;
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
revoke all on function public.claim_application_attempt(uuid) from public, anon, authenticated;
grant execute on function public.claim_application_attempt(uuid) to service_role;
notify pgrst, 'reload schema';
