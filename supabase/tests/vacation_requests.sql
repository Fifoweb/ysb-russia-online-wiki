begin;
set local statement_timeout='15s';
insert into auth.users(id,aud,role) values
 ('00000000-0000-4000-8000-00000000e101','authenticated','authenticated'),
 ('00000000-0000-4000-8000-00000000e102','authenticated','authenticated');
insert into public.vacation_requests(id,user_id,display_name,department,leadership,reason,starts_at,ends_at,delivery_status) values
 ('00000000-0000-4000-8000-00000000e201','00000000-0000-4000-8000-00000000e101','Test One','dps','dps','Private reason',now()-interval '1 day',now()+interval '1 day','delivered'),
 ('00000000-0000-4000-8000-00000000e202','00000000-0000-4000-8000-00000000e102','Test Two','mb','mb','Other private reason',now()+interval '1 day',now()+interval '2 days','delivered'),
 ('00000000-0000-4000-8000-00000000e203','00000000-0000-4000-8000-00000000e101','Test One','dps','dps','Failed private reason',now()+interval '1 day',now()+interval '2 days','failed');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000e101","role":"authenticated"}',true);
do $$
declare n integer;
begin
  select count(*) into n from public.vacation_requests;
  if n<>2 then raise exception 'Owner-only vacation policy failed'; end if;
  if exists(select 1 from public.vacation_requests where reason='Other private reason') then raise exception 'Other reason exposed'; end if;
  select count(*) into n from public.list_vacations();
  if n<>2 then raise exception 'Dashboard must contain current and future delivered requests'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='list_vacations' and column_name='reason') then raise exception 'Dashboard exposed a reason'; end if;
  begin
    insert into public.vacation_requests(id,user_id,display_name,department,leadership,reason,starts_at,ends_at,delivery_status)
      values(gen_random_uuid(),auth.uid(),'Forged','dps','dps','Forged request',now(),now()+interval '1 day','delivered');
    raise exception 'Client forged a delivered vacation';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$
declare outcome text;
begin
  if has_function_privilege('anon','public.list_vacations()','execute') or has_table_privilege('authenticated','public.vacation_requests','insert') then raise exception 'Vacation privileges leaked'; end if;
  if has_function_privilege('authenticated','public.reserve_vacation(uuid,uuid,text,text,text,text,timestamptz,timestamptz)','execute') then raise exception 'Client can reserve vacation'; end if;
  outcome:=public.reserve_vacation('00000000-0000-4000-8000-00000000e204','00000000-0000-4000-8000-00000000e101','Test One','dps','dps','Private',now(),now()+interval '2 days');
  if outcome<>'overlap' then raise exception 'Overlapping vacation accepted'; end if;
  outcome:=public.reserve_vacation('00000000-0000-4000-8000-00000000e203','00000000-0000-4000-8000-00000000e101','Test One','dps','dps','Private',now()+interval '3 days',now()+interval '4 days');
  if outcome<>'reserved' then raise exception 'Known failure cannot retry'; end if;
  outcome:=public.reserve_vacation('00000000-0000-4000-8000-00000000e203','00000000-0000-4000-8000-00000000e101','Test One','dps','dps','Private',now()+interval '3 days',now()+interval '4 days');
  if outcome<>'uncertain' then raise exception 'Sending vacation resent'; end if;
  outcome:=public.reserve_vacation('00000000-0000-4000-8000-00000000e201','00000000-0000-4000-8000-00000000e101','Test One','dps','dps','Private',now(),now()+interval '2 days');
  if outcome<>'delivered' then raise exception 'Delivered retry not idempotent'; end if;
end;
$$;
rollback;
