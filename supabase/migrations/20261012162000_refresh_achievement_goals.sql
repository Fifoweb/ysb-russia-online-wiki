-- Refresh the current plan while preserving historical reports and the prior plan.
insert into private.achievement_goals(id,target,metric) values ('motorcyclists',20,'sum'),('airdrop',10,'sum');
update private.achievement_goals set target=3 where id='joint-exercises';
create or replace function public.get_achievement_dashboard(p_week_start date default null)
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
  for v_goal in select id, metric,
    case when v_week < date '2026-10-12' and id='joint-exercises' then 2 else target end as target
    from private.achievement_goals
    where (v_week < date '2026-10-12' and id not in ('motorcyclists','airdrop')) or
      (v_week >= date '2026-10-12' and id <> 'escorts')
    order by id loop
    select coalesce(case v_goal.metric when 'average' then avg(quantity)::numeric
      when 'distinct-days' then count(distinct work_date)::numeric else sum(quantity)::numeric end, 0), count(*)
      into v_value, v_count from private.achievement_reports
      where week_start = v_week and achievement_id = v_goal.id and delivery_status = 'sent';
    v_departments := '{}'::jsonb;
    for v_dept in select unnest(array['academy','gu','usb','uku','uor','sdb','mb','ugk','dps','udo','ukm']) loop
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
    'availableWeeks', (select jsonb_agg(week_start order by week_start desc) from (
      select v_current as week_start
      union
      select week_start from private.achievement_reports
        where delivery_status = 'sent' and week_start between v_current - 364 and v_current
    ) weeks),
    'days', (select jsonb_agg(jsonb_build_object('date', d::date, 'reports', (
      select count(*) from private.achievement_reports where week_start = v_week and work_date = d::date and delivery_status = 'sent')) order by d)
      from generate_series(v_week::timestamp, (v_week + 6)::timestamp, interval '1 day') d));
end;
$$;
revoke all on function public.get_achievement_dashboard(date) from public;
grant execute on function public.get_achievement_dashboard(date) to anon, authenticated, service_role;

-- Explicitly requested reset of 12-18 October only. Discord messages remain intact.
do $$
begin
  if date_trunc('week',now() at time zone 'Europe/Moscow')::date <> date '2026-10-12' then
    raise exception 'Cleanup aborted: unexpected Moscow week';
  end if;
  lock table private.achievement_reports in share row exclusive mode;
  if exists(select 1 from private.achievement_reports where week_start=date '2026-10-12'
    and delivery_status='sending' and created_at>now()-interval '1 minute') then
    raise exception 'Cleanup aborted: a report is currently being delivered';
  end if;
  delete from private.achievement_reports where week_start=date '2026-10-12';
end;
$$;
