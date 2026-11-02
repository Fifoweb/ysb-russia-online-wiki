-- Run in a rolled-back transaction; creates no persistent accounts or profiles.
begin;
set local statement_timeout = '15s';

insert into auth.users(id,aud,role) values
  ('00000000-0000-4000-8000-00000000f101','authenticated','authenticated'),
  ('00000000-0000-4000-8000-00000000f102','authenticated','authenticated');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f101","role":"authenticated"}',true);
do $$
declare v_count integer;
begin
  insert into public.profiles(id,game_nickname,static_id,department,rank,updated_at)
  values(auth.uid(),'Offline_Officer','000123','usb','Лейтенант','2000-01-01');
  select count(*) into v_count from public.profiles;
  if v_count<>1 then raise exception 'A profile owner can read another user profile'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and static_id='000123'
    and rank='Лейтенант' and updated_at>now()-interval '1 minute') then
    raise exception 'Profile save lost fields or accepted a forged update timestamp';
  end if;
  begin
    insert into public.profiles(id,game_nickname,static_id,department)
    values('00000000-0000-4000-8000-00000000f102','Forged_Officer','456','dps');
    raise exception 'An account wrote a different account profile';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set id='00000000-0000-4000-8000-00000000f102' where id=auth.uid();
    raise exception 'A profile was rebound to a different account';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set static_id='#123' where id=auth.uid();
    raise exception 'Invalid static ID accepted';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set department='administrator' where id=auth.uid();
    raise exception 'Invalid department accepted';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set game_nickname=E'Bad\nName' where id=auth.uid();
    raise exception 'Invalid nickname accepted';
  exception when check_violation then null;
  end;
end;
$$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000f102","role":"authenticated"}',true);
do $$
begin
  if exists(select 1 from public.profiles) then raise exception 'Other account can read the first profile'; end if;
  update public.profiles set game_nickname='Forged_Officer' where id='00000000-0000-4000-8000-00000000f101';
  if found then raise exception 'Other account can update the first profile'; end if;
  -- Legacy profiles with no new fields remain compatible.
  insert into public.profiles(id,full_name,about) values(auth.uid(),'Legacy Officer','Existing profile');
end;
$$;

reset role;
do $$
begin
  if has_table_privilege('anon','public.profiles','select')
    or has_table_privilege('anon','public.profiles','insert')
    or has_table_privilege('authenticated','public.profiles','truncate') then
    raise exception 'Profile privileges leaked';
  end if;
  if not exists(select 1 from public.profiles where id='00000000-0000-4000-8000-00000000f102'
    and full_name='Legacy Officer' and about='Existing profile' and game_nickname='' and static_id='' and department='') then
    raise exception 'Legacy profile compatibility changed';
  end if;
end;
$$;
rollback;
