begin;
set local statement_timeout='15s';
insert into auth.users(id,aud,role) values
 ('00000000-0000-4000-8000-00000000ed01','authenticated','authenticated'),
 ('00000000-0000-4000-8000-00000000ed02','authenticated','authenticated');
insert into public.vacation_requests(id,user_id,display_name,department,leadership,reason,starts_at,ends_at,delivery_status) values
 ('00000000-0000-4000-8000-00000000ee01','00000000-0000-4000-8000-00000000ed01','CancelTestSelf','dps','dps','Test',now()+interval '1 day',now()+interval '2 days','delivered'),
 ('00000000-0000-4000-8000-00000000ee02','00000000-0000-4000-8000-00000000ed02','CancelTestOther','mb','mb','Test',now()+interval '1 day',now()+interval '2 days','delivered'),
 ('00000000-0000-4000-8000-00000000ee03','00000000-0000-4000-8000-00000000ed01','CancelTestCurrent','dps','dps','Test',now()-interval '1 day',now()+interval '1 hour','delivered'),
 ('00000000-0000-4000-8000-00000000ee04','00000000-0000-4000-8000-00000000ed01','CancelTestFailed','dps','dps','Test',now()+interval '3 days',now()+interval '4 days','failed');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000ed01","role":"authenticated"}',true);
do $$
declare result jsonb;
begin
  if public.cancel_my_vacation('00000000-0000-4000-8000-00000000ee02')->>'status'<>'not_found' then raise exception 'Foreign vacation accessible'; end if;
  if public.cancel_my_vacation('00000000-0000-4000-8000-00000000ee03')->>'status'<>'not_upcoming' then raise exception 'Started vacation cancelled'; end if;
  if public.cancel_my_vacation('00000000-0000-4000-8000-00000000ee04')->>'status'<>'not_upcoming' then raise exception 'Failed delivery cancelled'; end if;
  result:=public.cancel_my_vacation('00000000-0000-4000-8000-00000000ee01');
  if result->>'status'<>'cancelled' or (result->>'cancelled_at')::timestamptz<now() then raise exception 'Cancellation failed'; end if;
  if result<>public.cancel_my_vacation('00000000-0000-4000-8000-00000000ee01') then raise exception 'Cancellation retry changed timestamp'; end if;
  if public.end_my_vacation('00000000-0000-4000-8000-00000000ee01')->>'status'<>'not_active' then raise exception 'Cancelled vacation returned early'; end if;
  if exists(select 1 from public.list_vacations() where display_name='CancelTestSelf') then raise exception 'Cancelled vacation on dashboard'; end if;
  if not exists(select 1 from public.list_vacations() where display_name='CancelTestOther') then raise exception 'Other vacation removed'; end if;
  if not exists(select 1 from public.vacation_requests where id='00000000-0000-4000-8000-00000000ee01' and cancelled_at is not null and starts_at=now()+interval '1 day' and ends_at=now()+interval '2 days') then raise exception 'Cancellation history lost'; end if;
end;
$$;
reset role;
do $$
begin
  if has_function_privilege('anon','public.cancel_my_vacation(uuid)','execute') then raise exception 'Anonymous cancellation enabled'; end if;
  if exists(select 1 from public.vacation_requests where id='00000000-0000-4000-8000-00000000ee02' and cancelled_at is not null) then raise exception 'Foreign vacation modified'; end if;
  if public.reserve_vacation('00000000-0000-4000-8000-00000000ee05','00000000-0000-4000-8000-00000000ed01','CancelTestNew','dps','dps','Test',now()+interval '1 day',now()+interval '2 days')<>'reserved' then raise exception 'Cancelled vacation blocks new period'; end if;
end;
$$;
rollback;
