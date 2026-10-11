-- Run after the migration in a transaction. Test reports are rolled back, never sent to Discord.
do $$
declare
  v_week date := date_trunc('week', now() at time zone 'Europe/Moscow')::date;
  v_body jsonb;
  v_result jsonb;
  v_id uuid;
  v_dashboard jsonb;
begin
  if has_function_privilege('anon', 'public.reserve_achievement_report(uuid,uuid,text,text,jsonb,text,text[])', 'execute') or
    has_function_privilege('authenticated', 'public.settle_achievement_report(uuid,text,text)', 'execute') or
    has_table_privilege('anon', 'private.achievement_reports', 'select') or
    has_table_privilege('authenticated', 'private.achievement_reports', 'insert') then
    raise exception 'Private report privileges leaked';
  end if;
  v_body := jsonb_build_object('fullName','Fixture User','staticId','12345','department','usb',
    'achievementId','fines','quantity',12,'workDate',v_week,'workTime','00:01',
    'evidence',jsonb_build_array('https://example.test/fixture-fines'),'rulesAccepted',true);
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011','123456789012345678','fixture',v_body,repeat('a',64),array['https://example.test/fixture-fines']);
  if v_result->>'result' <> 'reserved' then raise exception 'Could not reserve fixture'; end if;
  v_id := (v_result->>'id')::uuid;
  if not public.settle_achievement_report(v_id,'sent','234567890123456789') then raise exception 'Could not confirm delivery'; end if;
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000011','123456789012345678','fixture',v_body,repeat('a',64),array['https://example.test/fixture-fines']);
  if v_result->>'result' <> 'sent' then raise exception 'Idempotent replay failed'; end if;
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000012','123456789012345678','fixture',v_body,repeat('b',64),array['https://example.test/fixture-fines']);
  if v_result->>'result' <> 'duplicate' then raise exception 'Duplicate proof accepted'; end if;
  v_body := v_body || jsonb_build_object('achievementId','warehouse','quantity',1,'evidence',jsonb_build_array('https://example.test/warehouse'));
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000013','123456789012345678','fixture',v_body,repeat('c',64),array['https://example.test/warehouse']);
  perform public.settle_achievement_report((v_result->>'id')::uuid,'sent','234567890123456789');
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000014','123456789012345678','fixture',v_body,repeat('d',64),array['https://example.test/warehouse-different']);
  if v_result->>'result' <> 'duplicate' then raise exception 'Second warehouse check on same day accepted'; end if;
  v_body := v_body || jsonb_build_object('achievementId','average-online','quantity',80,'workTime','00:01');
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000015','123456789012345678','fixture',v_body,repeat('e',64),array['https://example.test/online-80']);
  perform public.settle_achievement_report((v_result->>'id')::uuid,'sent','234567890123456789');
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000016','123456789012345678','fixture',v_body,repeat('f',64),array['https://example.test/online-duplicate']);
  if v_result->>'result' <> 'duplicate' then raise exception 'Duplicate online minute accepted'; end if;
  v_body := v_body || jsonb_build_object('quantity',120,'workTime','00:02');
  v_result := public.reserve_achievement_report('00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000017','123456789012345678','fixture',v_body,repeat('1',64),array['https://example.test/online-120']);
  perform public.settle_achievement_report((v_result->>'id')::uuid,'sent','234567890123456789');
  v_dashboard := public.get_achievement_dashboard(v_week);
  if (select (item->>'value')::numeric from jsonb_array_elements(v_dashboard->'items') item where item->>'id'='average-online') <> 100 or
    (select (item->>'value')::numeric from jsonb_array_elements(v_dashboard->'items') item where item->>'id'='fines') <> 12 or
    (select (item->>'value')::numeric from jsonb_array_elements(v_dashboard->'items') item where item->>'id'='warehouse') <> 1 then
    raise exception 'Aggregate calculation failed';
  end if;
  if v_dashboard::text ~ '(discord_id|full_name|static_id|evidence|https://example.test|Fixture User)' then raise exception 'Public dashboard leaked private data'; end if;
  if (public.get_achievement_dashboard(v_week - 7)->>'reports')::integer <> 0 then raise exception 'Weekly counters did not reset'; end if;
end;
$$;
set local role anon;
select jsonb_array_length(public.get_achievement_dashboard()->'items') = 9 as public_dashboard_access;
reset role;
