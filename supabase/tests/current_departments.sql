begin;
set local statement_timeout='15s';
do $$
declare v_before jsonb; v_after jsonb; v_week date:=date_trunc('week',now() at time zone 'Europe/Moscow')::date;
begin
  select item into v_before from jsonb_array_elements(public.get_achievement_dashboard(v_week)->'items') item where item->>'id'='fines';
  insert into private.achievement_reports(id,user_id,request_id,fingerprint,discord_id,discord_name,full_name,static_id,department,achievement_id,quantity,week_start,work_date,work_time,evidence,delivery_status) values
    ('00000000-0000-4000-8000-00000000fc01','00000000-0000-4000-8000-00000000fd01','00000000-0000-4000-8000-00000000fe01',repeat('1',64),'123456789012345678','Offline','Offline Fixture','1','ovk','fines',4,v_week,v_week,'12:00','["https://example.test/ovk"]','sent'),
    ('00000000-0000-4000-8000-00000000fc02','00000000-0000-4000-8000-00000000fd02','00000000-0000-4000-8000-00000000fe02',repeat('2',64),'123456789012345678','Offline','Offline Fixture','1','udk','fines',2,v_week,v_week,'12:01','["https://example.test/udk"]','sent'),
    ('00000000-0000-4000-8000-00000000fc03','00000000-0000-4000-8000-00000000fd03','00000000-0000-4000-8000-00000000fe03',repeat('3',64),'123456789012345678','Offline','Offline Fixture','1','usb','fines',3,v_week,v_week,'12:02','["https://example.test/legacy"]','sent');
  select item into v_after from jsonb_array_elements(public.get_achievement_dashboard(v_week)->'items') item where item->>'id'='fines';
  if (v_after->>'value')::numeric<>(v_before->>'value')::numeric+9 then raise exception 'Total contribution changed'; end if;
  if (v_after->>'reports')::int<>(v_before->>'reports')::int+3 then raise exception 'Report count changed'; end if;
  if (v_after#>>'{departments,ovk,value}')::numeric<>(v_before#>>'{departments,ovk,value}')::numeric+7 then raise exception 'OVK lost legacy USB contribution'; end if;
  if (v_after#>>'{departments,ovk,reports}')::int<>(v_before#>>'{departments,ovk,reports}')::int+2 then raise exception 'OVK lost legacy USB reports'; end if;
  if (v_after#>>'{departments,udk,value}')::numeric<>(v_before#>>'{departments,udk,value}')::numeric+2 then raise exception 'UDK contribution missing'; end if;
  if (v_after#>>'{departments,udk,reports}')::int<>(v_before#>>'{departments,udk,reports}')::int+1 then raise exception 'UDK report missing'; end if;
  if (v_after->'departments')?'usb' then raise exception 'Retired department still on dashboard'; end if;
  if not exists(select 1 from private.achievement_reports where id='00000000-0000-4000-8000-00000000fc03' and department='usb' and quantity=3) then raise exception 'Original historical record changed'; end if;
end;
$$;
rollback;
