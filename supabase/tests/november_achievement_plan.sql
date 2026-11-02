-- Database-only fixtures. Every change is rolled back; no Discord delivery occurs.
begin;
set local statement_timeout = '15s';

do $$
declare
  v_week date := date_trunc('week',now() at time zone 'Europe/Moscow')::date;
  v_data jsonb;
  v_body jsonb;
  v_result jsonb;
  v_id uuid;
  v_goal text;
  v_date date;
  v_target integer;
  v_targets integer[];
  v_day integer;
begin
  if v_week<date '2026-11-02' then raise exception 'November plan is not effective yet'; end if;
  v_data := public.get_achievement_dashboard(v_week);
  select array_agg((item->>'target')::integer order by ord) into v_targets
    from jsonb_array_elements(v_data->'items') with ordinality as i(item,ord);
  if v_targets<>array[30,130,30,20,50,10,3,7,90,3] then
    raise exception 'Current targets or ordering do not match the November plan';
  end if;
  if (select array_agg(item->>'id' order by ord) from jsonb_array_elements(v_data->'items') with ordinality as i(item,ord))
    <>array['recruitment','fines','photo-fines','electronic-transfers','detainees','airdrop','warehouse','captures','average-online','training'] then
    raise exception 'Current goal selection changed';
  end if;
  foreach v_date in array array[date '2026-10-05',date '2026-10-12',date '2026-10-19',date '2026-10-26'] loop
    v_data := public.get_achievement_dashboard(v_date);
    if not exists(select 1 from jsonb_array_elements(v_data->'items') i where i->>'id'='recruitment' and i->>'target'='50')
      or not exists(select 1 from jsonb_array_elements(v_data->'items') i where i->>'id'='fines' and i->>'target'='200')
      or not exists(select 1 from jsonb_array_elements(v_data->'items') i where i->>'id'='detainees' and i->>'target'='30')
      or not exists(select 1 from jsonb_array_elements(v_data->'items') i where i->>'id'='average-online' and i->>'target'='100')
      or exists(select 1 from jsonb_array_elements(v_data->'items') i where i->>'id' in ('photo-fines','electronic-transfers','captures','training')) then
      raise exception 'Archived targets or goal selection changed for %',v_date;
    end if;
  end loop;
  if has_table_privilege('anon','private.achievement_goal_plans','select')
    or has_table_privilege('authenticated','private.achievement_goal_plans','insert')
    or has_function_privilege('anon','private.achievement_plan(date)','execute')
    or has_function_privilege('authenticated','public.reserve_achievement_report(uuid,uuid,text,text,jsonb,text,text[])','execute') then
    raise exception 'Private plan or reservation privileges leaked';
  end if;

  -- Isolate fixture counters inside this transaction; rollback restores live work.
  delete from private.achievement_evidence where week_start=v_week;
  delete from private.achievement_reports where week_start=v_week;
  delete from private.achievement_completions where week_start=v_week;
  v_body := jsonb_build_object('fullName','Offline Fixture','staticId','1','department','gu','quantity',1,
    'workDate',v_week,'workTime','00:01','rulesAccepted',true,'evidence',jsonb_build_array('https://example.test/november'));
  foreach v_goal in array array['discipline','motorcyclists','joint-exercises','academy-graduates','clean-week','escorts'] loop
    v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',gen_random_uuid(),
      '123456789012345678','offline-fixture',v_body||jsonb_build_object('achievementId',v_goal),repeat('a',64),array['https://example.test/november']);
    if v_result->>'result'<>'invalid' then raise exception 'Retired goal % accepted a report',v_goal; end if;
  end loop;

  -- New/changed sum goals reserve capacity, count only confirmed deliveries and close exactly at target.
  for v_goal,v_target in select id,target from private.achievement_plan(v_week) where metric='sum' loop
    v_body := v_body||jsonb_build_object('achievementId',v_goal,'quantity',v_target+1);
    v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',gen_random_uuid(),
      '123456789012345678','offline-fixture',v_body,repeat('b',64),array['https://example.test/november-'||v_goal]);
    if v_result->>'result'<>'limit' or (v_result->>'remaining')::integer<>v_target then
      raise exception 'Capacity limit failed for %',v_goal;
    end if;
    v_body := v_body||jsonb_build_object('quantity',v_target);
    v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',gen_random_uuid(),
      '123456789012345678','offline-fixture',v_body,repeat('c',64),array['https://example.test/november-'||v_goal]);
    if v_result->>'result'<>'reserved' then raise exception 'Reservation failed for %: %',v_goal,v_result; end if;
    v_id := (v_result->>'id')::uuid;
    v_data := public.get_achievement_dashboard(v_week);
    if not exists(select 1 from jsonb_array_elements(v_data->'items') i
      where i->>'id'=v_goal and i->>'value'='0' and i->>'pendingReports'='1' and i->>'remaining'='0') then
      raise exception 'Pending work was counted or capacity was lost for %',v_goal;
    end if;
    if not public.settle_achievement_report(v_id,'sent','234567890123456789') then raise exception 'Settlement failed'; end if;
    v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',gen_random_uuid(),
      '123456789012345678','offline-fixture',v_body||jsonb_build_object('quantity',1),repeat('d',64),array['https://example.test/closed-'||v_goal]);
    if v_result->>'result'<>'closed' then raise exception 'Completed goal % reopened',v_goal; end if;
    v_data := public.get_achievement_dashboard(v_week);
    if not exists(select 1 from jsonb_array_elements(v_data->'items') i
      where i->>'id'=v_goal and (i->>'value')::integer=v_target and i->>'closed'='true') then
      raise exception 'Wrong credited result for %',v_goal;
    end if;
  end loop;

  -- Online remains an average: 80 and 100 reach the new target of 90.
  foreach v_target in array array[80,100] loop
    v_body := v_body||jsonb_build_object('achievementId','average-online','quantity',v_target,
      'workTime',case when v_target=80 then '00:01' else '00:02' end);
    v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',gen_random_uuid(),
      '123456789012345678','offline-fixture',v_body,repeat('e',64),array['https://example.test/online-'||v_target]);
    if v_result->>'result'<>'reserved' then raise exception 'Online reservation failed'; end if;
    perform public.settle_achievement_report((v_result->>'id')::uuid,'sent','234567890123456789');
  end loop;
  v_data := public.get_achievement_dashboard(v_week);
  if not exists(select 1 from jsonb_array_elements(v_data->'items') i
    where i->>'id'='average-online' and (i->>'value')::numeric=90 and i->>'closed'='true') then
    raise exception 'Online was not averaged to 90';
  end if;

  -- Three warehouse checks must be on different days, independently of department.
  for v_day in 0..2 loop
    insert into private.achievement_reports(user_id,request_id,fingerprint,discord_id,discord_name,full_name,
      static_id,department,achievement_id,quantity,week_start,work_date,work_time,evidence,delivery_status)
    values('00000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('f',64),'123456789012345678',
      'offline-fixture','Offline Fixture','1','gu','warehouse',1,v_week,v_week+v_day,'00:01','["https://example.test/warehouse"]','sent');
  end loop;
  begin
    insert into private.achievement_reports(user_id,request_id,fingerprint,discord_id,discord_name,full_name,
      static_id,department,achievement_id,quantity,week_start,work_date,work_time,evidence)
    values('00000000-0000-4000-8000-000000000002',gen_random_uuid(),repeat('f',64),'123456789012345678',
      'offline-fixture','Offline Fixture','1','usb','warehouse',1,v_week,v_week,'00:02','["https://example.test/duplicate"]');
    raise exception 'Warehouse counted the same day twice';
  exception when unique_violation then null;
  end;
  v_data := public.get_achievement_dashboard(v_week);
  if not exists(select 1 from jsonb_array_elements(v_data->'items') i
    where i->>'id'='warehouse' and i->>'value'='3' and i->>'closed'='true') then
    raise exception 'Three distinct warehouse days did not complete the goal';
  end if;
  if v_data::text ~ '(discord_id|full_name|static_id|evidence|example.test|Offline Fixture)' then
    raise exception 'Public dashboard leaked private report data';
  end if;
end;
$$;

set local role anon;
select jsonb_array_length(public.get_achievement_dashboard()->'items')=10 as public_dashboard_access;
reset role;
rollback;
