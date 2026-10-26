-- Run within a rolled-back transaction. No Discord requests are made.
begin;
do $$
declare
  v_week date := date_trunc('week',now() at time zone 'Europe/Moscow')::date;
  v_data jsonb;
  v_result jsonb;
  v_baseline bigint;
  v_date date;
begin
  v_data := public.get_achievement_dashboard(v_week);
  if jsonb_array_length(v_data->'items')<>10
    or not exists(select 1 from jsonb_array_elements(v_data->'items') item where item->>'id'='clean-week' and item->>'target'='7')
    or not exists(select 1 from jsonb_array_elements(v_data->'items') item where item->>'id'='joint-exercises' and item->>'target'='2')
    or exists(select 1 from jsonb_array_elements(v_data->'items') item where item->>'id' in ('airdrop','escorts')) then
    raise exception 'Current weekly plan does not match the requested goals';
  end if;
  foreach v_date in array array[date '2026-10-12', date '2026-10-19'] loop
    v_data := public.get_achievement_dashboard(v_date);
    if jsonb_array_length(v_data->'items')<>10
      or not exists(select 1 from jsonb_array_elements(v_data->'items') item where item->>'id'='airdrop')
      or not exists(select 1 from jsonb_array_elements(v_data->'items') item where item->>'id'='joint-exercises' and item->>'target'='3')
      or exists(select 1 from jsonb_array_elements(v_data->'items') item where item->>'id'='clean-week') then
      raise exception 'October 12-25 archive changed';
    end if;
  end loop;
  v_data := public.get_achievement_dashboard(date '2026-10-05');
  if jsonb_array_length(v_data->'items')<>9
    or not exists(select 1 from jsonb_array_elements(v_data->'items') item where item->>'id'='escorts')
    or not exists(select 1 from jsonb_array_elements(v_data->'items') item where item->>'id'='joint-exercises' and item->>'target'='2') then
    raise exception 'Original archived plan changed';
  end if;
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',gen_random_uuid(),
    '123456789012345678','offline-fixture',jsonb_build_object('achievementId','clean-week','rulesAccepted',true,
      'quantity',2,'workDate',v_week,'workTime','12:00','evidence',jsonb_build_array('https://example.test/offline')),
    repeat('a',64),array['https://example.test/offline']);
  if v_result->>'result'<>'invalid' then raise exception 'Clean day accepts more than one unit'; end if;
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',gen_random_uuid(),
    '123456789012345678','offline-fixture',jsonb_build_object('achievementId','airdrop','rulesAccepted',true),repeat('b',64),array['https://example.test/offline']);
  if v_result->>'result'<>'invalid' then raise exception 'Retired AirDrop goal still accepts reports'; end if;
  select count(*) into v_baseline from private.achievement_reports;
  -- Synthetic sent rows test seven distinct days; they are rolled back below.
  insert into private.achievement_reports(user_id,request_id,fingerprint,discord_id,discord_name,full_name,
    static_id,department,achievement_id,quantity,week_start,work_date,work_time,evidence,delivery_status)
  select '00000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('c',64),'123456789012345678',
    'offline-fixture','Offline Fixture','1','gu','clean-week',1,v_week,v_week+day,'12:00',
    jsonb_build_array('https://example.test/offline-'||day),'sent'
  from generate_series(0,6) day
  where not exists(select 1 from private.achievement_reports where achievement_id='clean-week'
    and week_start=v_week and work_date=v_week+day and delivery_status in ('sending','sent','uncertain'));
  v_data := public.get_achievement_dashboard(v_week);
  if not exists(select 1 from jsonb_array_elements(v_data->'items') item
    where item->>'id'='clean-week' and item->>'value'='7' and item->>'closed'='true') then
    raise exception 'Seven clean days do not complete the weekly goal';
  end if;
  begin
    insert into private.achievement_reports(user_id,request_id,fingerprint,discord_id,discord_name,full_name,
      static_id,department,achievement_id,quantity,week_start,work_date,work_time,evidence)
    values('00000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('d',64),'123456789012345678',
      'offline-fixture','Offline Fixture','1','usb','clean-week',1,v_week,v_week,'13:00','["https://example.test/duplicate"]');
    raise exception 'Duplicate clean-day report was accepted';
  exception when unique_violation then null;
  end;
end;
$$;
rollback;
