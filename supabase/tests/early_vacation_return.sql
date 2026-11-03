-- Fixtures and the early return are entirely rolled back. No Discord requests.
begin;
set local statement_timeout='15s';
insert into auth.users(id,aud,role) values
 ('00000000-0000-4000-8000-00000000eb01','authenticated','authenticated'),
 ('00000000-0000-4000-8000-00000000eb02','authenticated','authenticated');
insert into public.vacation_requests(id,user_id,display_name,department,leadership,reason,starts_at,ends_at,delivery_status) values
 ('00000000-0000-4000-8000-00000000ec01','00000000-0000-4000-8000-00000000eb01','EarlyReturnTestSelf','dps','dps','Test',now()-interval '1 day',now()+interval '1 day','delivered'),
 ('00000000-0000-4000-8000-00000000ec02','00000000-0000-4000-8000-00000000eb02','EarlyReturnTestOther','mb','mb','Test',now()-interval '1 day',now()+interval '1 day','delivered'),
 ('00000000-0000-4000-8000-00000000ec03','00000000-0000-4000-8000-00000000eb01','EarlyReturnTestFuture','dps','dps','Test',now()+interval '2 days',now()+interval '3 days','delivered'),
 ('00000000-0000-4000-8000-00000000ec04','00000000-0000-4000-8000-00000000eb01','EarlyReturnTestExpired','dps','dps','Test',now()-interval '3 days',now()-interval '2 days','delivered'),
 ('00000000-0000-4000-8000-00000000ec05','00000000-0000-4000-8000-00000000eb01','EarlyReturnTestFailed','dps','dps','Test',now()-interval '1 day',now()+interval '1 day','failed');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000eb01","role":"authenticated"}',true);
do $$
declare v_result jsonb; v_again jsonb; v_id uuid;
begin
  v_result:=public.end_my_vacation('00000000-0000-4000-8000-00000000ec02');
  if v_result->>'status'<>'not_found' then raise exception 'Foreign vacation was accessible'; end if;
  foreach v_id in array array['00000000-0000-4000-8000-00000000ec03'::uuid,'00000000-0000-4000-8000-00000000ec04'::uuid,'00000000-0000-4000-8000-00000000ec05'::uuid] loop
    if public.end_my_vacation(v_id)->>'status'<>'not_active' then raise exception 'Nonactive vacation was ended'; end if;
  end loop;
  v_result:=public.end_my_vacation('00000000-0000-4000-8000-00000000ec01');
  if v_result->>'status'<>'ended' or (v_result->>'returned_at')::timestamptz<now() then raise exception 'Current vacation did not end'; end if;
  v_again:=public.end_my_vacation('00000000-0000-4000-8000-00000000ec01');
  if v_result<>v_again then raise exception 'Retry changed the return timestamp'; end if;
  if exists(select 1 from public.list_vacations() where display_name='EarlyReturnTestSelf') then raise exception 'Ended employee still appears on dashboard'; end if;
  if not exists(select 1 from public.list_vacations() where display_name='EarlyReturnTestOther') then raise exception 'Other employee disappeared'; end if;
  if not exists(select 1 from public.vacation_requests where id='00000000-0000-4000-8000-00000000ec01' and starts_at=now()-interval '1 day' and ends_at=now()+interval '1 day' and returned_at is not null) then raise exception 'History or planned dates were lost'; end if;
  begin
    update public.vacation_requests set returned_at=now() where id='00000000-0000-4000-8000-00000000ec03';
    raise exception 'Client can bypass the return RPC';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$
declare outcome text;
begin
  if exists(select 1 from public.vacation_requests where id='00000000-0000-4000-8000-00000000ec02' and returned_at is not null) then raise exception 'Foreign vacation was modified'; end if;
  outcome:=public.reserve_vacation('00000000-0000-4000-8000-00000000ec06','00000000-0000-4000-8000-00000000eb01','EarlyReturnNew','dps','dps','Test',now()+interval '1 minute',now()+interval '1 hour');
  if outcome<>'reserved' then raise exception 'Old vacation still blocks a new period'; end if;
  if has_function_privilege('anon','public.end_my_vacation(uuid)','execute') then raise exception 'Anonymous return allowed'; end if;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform public.end_my_vacation('00000000-0000-4000-8000-00000000ec01');
    raise exception 'Anonymous caller ended vacation';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
