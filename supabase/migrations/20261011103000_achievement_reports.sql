-- Raw reports stay private. Only aggregate weekly figures are public.
create schema if not exists private;

create table private.achievement_goals (
  id text primary key,
  target integer not null check (target > 0),
  metric text not null check (metric in ('sum', 'average', 'distinct-days'))
);
insert into private.achievement_goals (id, target, metric) values
  ('academy-graduates', 40, 'sum'), ('discipline', 30, 'sum'), ('joint-exercises', 2, 'sum'),
  ('detainees', 30, 'sum'), ('escorts', 5, 'sum'), ('average-online', 100, 'average'),
  ('recruitment', 50, 'sum'), ('warehouse', 3, 'distinct-days'), ('fines', 200, 'sum');

create table private.achievement_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  discord_id text not null check (discord_id ~ '^\d{17,20}$'),
  discord_name text not null check (length(discord_name) between 1 and 80),
  full_name text not null check (length(full_name) between 3 and 100),
  static_id text not null check (static_id ~ '^\d{1,10}$'),
  department text not null check (department in ('academy','usb','uku','uor','sdb','mb','ugk','dps','udo','ukm')),
  achievement_id text not null references private.achievement_goals(id),
  quantity integer not null check (quantity between 0 and 99999),
  week_start date not null check (extract(isodow from week_start) = 1),
  work_date date not null,
  work_time time not null,
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) between 1 and 50),
  delivery_status text not null default 'sending' check (delivery_status in ('sending','sent','failed','uncertain')),
  discord_message_id text check (discord_message_id ~ '^\d{17,20}$'),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique(user_id, request_id),
  check (work_date >= week_start and work_date < week_start + 7)
);
create index achievement_reports_week on private.achievement_reports(week_start, achievement_id, department)
  where delivery_status = 'sent';
create unique index achievement_warehouse_day on private.achievement_reports(week_start, work_date)
  where achievement_id = 'warehouse' and delivery_status in ('sending','sent','uncertain');
create unique index achievement_online_measurement on private.achievement_reports(week_start, work_date, work_time)
  where achievement_id = 'average-online' and delivery_status in ('sending','sent','uncertain');

create table private.achievement_evidence (
  week_start date not null,
  url_key text not null check (octet_length(url_key) <= 1000),
  report_id uuid not null references private.achievement_reports(id) on delete cascade,
  primary key (week_start, url_key)
);

alter table private.achievement_goals enable row level security;
alter table private.achievement_reports enable row level security;
alter table private.achievement_evidence enable row level security;
revoke all on private.achievement_goals, private.achievement_reports, private.achievement_evidence from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on private.achievement_goals, private.achievement_reports, private.achievement_evidence to service_role;

create function public.reserve_achievement_report(
  p_user_id uuid, p_request_id uuid, p_discord_id text, p_discord_name text,
  p_body jsonb, p_fingerprint text, p_keys text[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_existing private.achievement_reports%rowtype;
  v_goal private.achievement_goals%rowtype;
  v_id uuid;
  v_today date := (now() at time zone 'Europe/Moscow')::date;
  v_week date := date_trunc('week', now() at time zone 'Europe/Moscow')::date;
  v_date date;
  v_time time;
  v_quantity integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_request_id::text, 0));
  select * into v_goal from private.achievement_goals where id = p_body->>'achievementId';
  if not found or p_body->>'rulesAccepted' is distinct from 'true' then
    return jsonb_build_object('result', 'invalid');
  end if;
  v_date := (p_body->>'workDate')::date;
  v_quantity := (p_body->>'quantity')::integer;
  v_time := (p_body->>'workTime')::time;
  if v_date < v_week or v_date > v_today or v_quantity < (case when v_goal.metric = 'average' then 0 else 1 end) or
    v_quantity > 99999 or (v_goal.metric = 'distinct-days' and v_quantity <> 1) or
    cardinality(p_keys) not between 1 and 50 or cardinality(p_keys) <> jsonb_array_length(p_body->'evidence') then
    return jsonb_build_object('result', 'invalid');
  end if;
  if v_time is null or (v_date + v_time) at time zone 'Europe/Moscow' > now() or
    (v_date + v_time) < v_week::timestamp + interval '1 minute' or
    now() < (v_week::timestamp + interval '1 minute') at time zone 'Europe/Moscow' then
    return jsonb_build_object('result', 'invalid');
  end if;
  select * into v_existing from private.achievement_reports where user_id = p_user_id and request_id = p_request_id for update;
  if found then
    if v_existing.fingerprint <> p_fingerprint then return jsonb_build_object('result', 'changed'); end if;
    if v_existing.delivery_status <> 'failed' then
      return jsonb_build_object('result', v_existing.delivery_status, 'id', v_existing.id);
    end if;
    v_id := v_existing.id;
    update private.achievement_reports set delivery_status = 'sending', created_at = now(), week_start = v_week,
      discord_message_id = null, delivered_at = null where id = v_id;
  else
    insert into private.achievement_reports(user_id, request_id, fingerprint, discord_id, discord_name, full_name,
      static_id, department, achievement_id, quantity, week_start, work_date, work_time, evidence)
    values (p_user_id, p_request_id, p_fingerprint, p_discord_id, left(p_discord_name, 80), p_body->>'fullName',
      p_body->>'staticId', p_body->>'department', v_goal.id, v_quantity, v_week, v_date, v_time, p_body->'evidence')
    returning id into v_id;
  end if;
  insert into private.achievement_evidence(week_start, url_key, report_id)
    select v_week, key, v_id from unnest(p_keys) as key;
  return jsonb_build_object('result', 'reserved', 'id', v_id, 'weekStart', v_week);
exception when unique_violation then
  return jsonb_build_object('result', 'duplicate');
end;
$$;

create function public.settle_achievement_report(p_report_id uuid, p_status text, p_message_id text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('sent','failed','uncertain') or (p_status = 'sent' and p_message_id !~ '^\d{17,20}$') or
    (p_status = 'sent' and p_message_id is null) then return false; end if;
  update private.achievement_reports set delivery_status = p_status, discord_message_id = p_message_id,
    delivered_at = case when p_status = 'sent' then now() else null end
    where id = p_report_id and delivery_status in ('sending','uncertain');
  if not found then return false; end if;
  if p_status = 'failed' then delete from private.achievement_evidence where report_id = p_report_id; end if;
  return true;
end;
$$;

create function public.get_achievement_dashboard(p_week_start date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_current date := date_trunc('week', now() at time zone 'Europe/Moscow')::date;
  v_week date := coalesce(p_week_start, v_current);
  v_goal record;
  v_dept text;
  v_value numeric;
  v_count bigint;
  v_departments jsonb;
  v_items jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if extract(isodow from v_week) <> 1 or v_week > v_current or v_week < v_current - 364 then
    raise exception 'Invalid achievement week' using errcode = '22023';
  end if;
  for v_goal in select * from private.achievement_goals order by id loop
    select coalesce(case v_goal.metric when 'average' then avg(quantity)::numeric
      when 'distinct-days' then count(distinct work_date)::numeric else sum(quantity)::numeric end, 0), count(*)
      into v_value, v_count from private.achievement_reports
      where week_start = v_week and achievement_id = v_goal.id and delivery_status = 'sent';
    v_departments := '{}'::jsonb;
    for v_dept in select unnest(array['academy','usb','uku','uor','sdb','mb','ugk','dps','udo','ukm']) loop
      v_departments := v_departments || jsonb_build_object(v_dept, (
        select jsonb_build_object('value', coalesce(case v_goal.metric when 'average' then avg(quantity)::numeric
          when 'distinct-days' then count(distinct work_date)::numeric else sum(quantity)::numeric end, 0), 'reports', count(*))
        from private.achievement_reports where week_start = v_week and achievement_id = v_goal.id
          and department = v_dept and delivery_status = 'sent'));
    end loop;
    v_items := v_items || jsonb_build_array(jsonb_build_object('id', v_goal.id, 'target', v_goal.target,
      'value', v_value, 'reports', v_count, 'departments', v_departments));
  end loop;
  select jsonb_build_object('reports', count(*), 'contributors', count(distinct user_id),
    'departments', count(distinct department), 'lastReportAt', max(delivered_at)) into v_result
    from private.achievement_reports where week_start = v_week and delivery_status = 'sent';
  return v_result || jsonb_build_object('weekStart', v_week, 'currentWeekStart', v_current,
    'weekEndsAt', ((v_week + 7)::timestamp at time zone 'Europe/Moscow'), 'generatedAt', now(), 'items', v_items,
    'days', (select jsonb_agg(jsonb_build_object('date', d::date, 'reports', (
      select count(*) from private.achievement_reports where week_start = v_week and work_date = d::date and delivery_status = 'sent')) order by d)
      from generate_series(v_week::timestamp, (v_week + 6)::timestamp, interval '1 day') d));
end;
$$;

revoke all on function public.reserve_achievement_report(uuid,uuid,text,text,jsonb,text,text[]) from public, anon, authenticated;
revoke all on function public.settle_achievement_report(uuid,text,text) from public, anon, authenticated;
grant execute on function public.reserve_achievement_report(uuid,uuid,text,text,jsonb,text,text[]) to service_role;
grant execute on function public.settle_achievement_report(uuid,text,text) to service_role;
revoke all on function public.get_achievement_dashboard(date) from public;
grant execute on function public.get_achievement_dashboard(date) to anon, authenticated, service_role;
