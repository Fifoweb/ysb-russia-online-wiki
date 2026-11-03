begin;
set local lock_timeout = '5s';

-- Independent of editable profile fields: clients cannot forge verified membership.
create table public.discord_department_syncs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  department text not null default '',
  status text not null default 'pending',
  checked_at timestamptz,
  lease_id uuid,
  lease_until timestamptz not null default '-infinity',
  constraint discord_department_result_valid check (
    (status='verified' and department in ('sdb','dps','ugk','mb','udk','uor','uku','ovk')) or
    (status in ('pending','none','not_member','multiple','unavailable') and department='')
  )
);
alter table public.discord_department_syncs enable row level security;
revoke all on public.discord_department_syncs from public,anon,authenticated;
grant select(user_id,department,status,checked_at) on public.discord_department_syncs to authenticated;
grant all on public.discord_department_syncs to service_role;
create policy "own verified department" on public.discord_department_syncs for select to authenticated
  using ((select auth.uid())=user_id);

create table public.discord_department_sync_limit (
  singleton boolean primary key default true check(singleton),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check(attempts>=0),
  blocked_until timestamptz not null default '-infinity'
);
alter table public.discord_department_sync_limit enable row level security;
revoke all on public.discord_department_sync_limit from public,anon,authenticated;
grant all on public.discord_department_sync_limit to service_role;

create function public.reserve_discord_department_sync(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_row public.discord_department_syncs;
  v_limit public.discord_department_sync_limit;
  v_now timestamptz := clock_timestamp();
  v_ticket uuid;
begin
  if p_user_id is null then raise exception 'User required'; end if;
  perform pg_advisory_xact_lock(547821903);
  select * into v_row from public.discord_department_syncs where user_id=p_user_id;
  if v_row.checked_at > v_now - (case when v_row.status='unavailable' then interval '15 seconds' else interval '60 seconds' end) then
    return jsonb_build_object('kind','cached','result',jsonb_build_object('department',v_row.department,'status',v_row.status,'checked_at',v_row.checked_at));
  end if;
  if v_row.lease_until > v_now then
    return jsonb_build_object('kind','busy','retryAfterSeconds',greatest(1,ceil(extract(epoch from v_row.lease_until-v_now))));
  end if;
  insert into public.discord_department_sync_limit(singleton) values(true) on conflict do nothing;
  select * into v_limit from public.discord_department_sync_limit where singleton;
  if v_limit.blocked_until>v_now then
    return jsonb_build_object('kind','limited','retryAfterSeconds',greatest(1,ceil(extract(epoch from v_limit.blocked_until-v_now))));
  end if;
  if v_limit.window_started_at<=v_now-interval '60 seconds' then
    update public.discord_department_sync_limit set window_started_at=v_now,attempts=0 where singleton returning * into v_limit;
  end if;
  if v_limit.attempts>=120 then
    return jsonb_build_object('kind','limited','retryAfterSeconds',greatest(1,ceil(extract(epoch from v_limit.window_started_at+interval '60 seconds'-v_now))));
  end if;
  update public.discord_department_sync_limit set attempts=attempts+1 where singleton;
  v_ticket := gen_random_uuid();
  insert into public.discord_department_syncs(user_id,lease_id,lease_until)
    values(p_user_id,v_ticket,v_now+interval '25 seconds')
    on conflict(user_id) do update set lease_id=v_ticket,lease_until=v_now+interval '25 seconds';
  return jsonb_build_object('kind','claimed','ticket',v_ticket);
end;
$$;

create function public.complete_discord_department_sync(p_user_id uuid,p_ticket uuid,p_department text,p_status text,p_retry_after integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.discord_department_syncs;
begin
  if p_status not in ('verified','none','not_member','multiple','unavailable') or p_retry_after is null or p_retry_after<0 or p_retry_after>300 then
    raise exception 'Invalid sync result';
  end if;
  perform pg_advisory_xact_lock(547821903);
  update public.discord_department_syncs set department=p_department,status=p_status,checked_at=clock_timestamp(),lease_id=null,lease_until='-infinity'
    where user_id=p_user_id and lease_id=p_ticket and lease_until>clock_timestamp() returning * into v_row;
  if not found then return null; end if;
  if p_status='unavailable' and p_retry_after>0 then
    update public.discord_department_sync_limit set blocked_until=greatest(blocked_until,clock_timestamp()+make_interval(secs=>p_retry_after)) where singleton;
  end if;
  return jsonb_build_object('department',v_row.department,'status',v_row.status,'checked_at',v_row.checked_at);
end;
$$;
revoke all on function public.reserve_discord_department_sync(uuid) from public,anon,authenticated;
revoke all on function public.complete_discord_department_sync(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_discord_department_sync(uuid) to service_role;
grant execute on function public.complete_discord_department_sync(uuid,uuid,text,text,integer) to service_role;

notify pgrst,'reload schema';
commit;
