-- Read/write checks are isolated and fully rolled back. No Discord requests.
begin;
set local statement_timeout='15s';
insert into auth.users(id,aud,role) values
 ('00000000-0000-4000-8000-00000000d101','authenticated','authenticated'),
 ('00000000-0000-4000-8000-00000000d102','authenticated','authenticated');

do $$
declare v_claim jsonb; v_again jsonb; v_result jsonb;
begin
  v_claim:=public.reserve_discord_department_sync('00000000-0000-4000-8000-00000000d101');
  if v_claim->>'kind'<>'claimed' then raise exception 'Initial sync not claimed'; end if;
  v_again:=public.reserve_discord_department_sync('00000000-0000-4000-8000-00000000d101');
  if v_again->>'kind'<>'busy' then raise exception 'Concurrent sync not serialized'; end if;
  if public.complete_discord_department_sync('00000000-0000-4000-8000-00000000d101',gen_random_uuid(),'dps','verified',0) is not null then
    raise exception 'Wrong lease accepted';
  end if;
  v_result:=public.complete_discord_department_sync('00000000-0000-4000-8000-00000000d101',(v_claim->>'ticket')::uuid,'sdb','verified',0);
  if v_result->>'department'<>'sdb' or v_result->>'status'<>'verified' or v_result ? 'lease_id' then raise exception 'Wrong public result'; end if;
  if public.complete_discord_department_sync('00000000-0000-4000-8000-00000000d101',(v_claim->>'ticket')::uuid,'mb','verified',0) is not null then
    raise exception 'Settled lease reused';
  end if;
  v_again:=public.reserve_discord_department_sync('00000000-0000-4000-8000-00000000d101');
  if v_again->>'kind'<>'cached' or v_again->'result'->>'department'<>'sdb' then raise exception 'Fresh cache missed'; end if;
  insert into public.discord_department_syncs(user_id,department,status,checked_at)
    values('00000000-0000-4000-8000-00000000d102','ovk','verified',now());
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000d101","role":"authenticated"}',true);
do $$
declare v_count integer;
begin
  select count(user_id) into v_count from public.discord_department_syncs;
  if v_count<>1 then raise exception 'Membership leaked across accounts'; end if;
  if not exists(select 1 from public.discord_department_syncs where department='sdb' and status='verified') then raise exception 'Owner cannot read result'; end if;
  begin
    update public.discord_department_syncs set department='mb' where user_id=auth.uid();
    raise exception 'User forged verified department';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.discord_department_syncs(user_id,department,status) values(auth.uid(),'mb','verified');
    raise exception 'User inserted verified membership';
  exception when insufficient_privilege then null; end;
  begin
    perform lease_id from public.discord_department_syncs;
    raise exception 'Lease token leaked';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_discord_department_sync(auth.uid());
    raise exception 'User called service-only guard';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

do $$
declare v_claim jsonb; v_result jsonb;
begin
  update public.discord_department_syncs set checked_at=now()-interval '2 minutes' where user_id='00000000-0000-4000-8000-00000000d101';
  v_claim:=public.reserve_discord_department_sync('00000000-0000-4000-8000-00000000d101');
  v_result:=public.complete_discord_department_sync('00000000-0000-4000-8000-00000000d101',(v_claim->>'ticket')::uuid,'','none',0);
  if v_result->>'department'<>'' or v_result->>'status'<>'none' then raise exception 'Removed role retained department'; end if;
  update public.discord_department_syncs set checked_at=now()-interval '2 minutes' where user_id='00000000-0000-4000-8000-00000000d101';
  v_claim:=public.reserve_discord_department_sync('00000000-0000-4000-8000-00000000d101');
  perform public.complete_discord_department_sync('00000000-0000-4000-8000-00000000d101',(v_claim->>'ticket')::uuid,'','unavailable',42);
  update public.discord_department_syncs set checked_at=now()-interval '2 minutes' where user_id='00000000-0000-4000-8000-00000000d102';
  v_claim:=public.reserve_discord_department_sync('00000000-0000-4000-8000-00000000d102');
  if v_claim->>'kind'<>'limited' then raise exception 'Provider backoff bypassed'; end if;
  update public.discord_department_sync_limit set blocked_until='-infinity',attempts=120;
  v_claim:=public.reserve_discord_department_sync('00000000-0000-4000-8000-00000000d102');
  if v_claim->>'kind'<>'limited' then raise exception 'Global request limit bypassed'; end if;
  update public.discord_department_sync_limit set window_started_at=now()-interval '2 minutes';
  v_claim:=public.reserve_discord_department_sync('00000000-0000-4000-8000-00000000d102');
  if v_claim->>'kind'<>'claimed' then raise exception 'Expired request window did not recover'; end if;
  update public.discord_department_syncs set lease_until=now()-interval '1 second' where user_id='00000000-0000-4000-8000-00000000d102';
  if public.complete_discord_department_sync('00000000-0000-4000-8000-00000000d102',(v_claim->>'ticket')::uuid,'dps','verified',0) is not null then
    raise exception 'Expired lease accepted';
  end if;
  if has_column_privilege('anon','public.discord_department_syncs','department','select')
    or has_table_privilege('authenticated','public.discord_department_sync_limit','select')
    or has_function_privilege('authenticated','public.complete_discord_department_sync(uuid,uuid,text,text,integer)','execute') then
    raise exception 'Private sync privileges leaked';
  end if;
end;
$$;
rollback;
