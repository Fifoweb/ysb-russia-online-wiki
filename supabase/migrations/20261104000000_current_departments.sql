begin;
set local lock_timeout='5s';
-- Keep retired IDs valid for existing records. New submissions use the current catalog.
alter table private.achievement_reports drop constraint achievement_reports_department_check;
alter table private.achievement_reports add constraint achievement_reports_department_check
  check (department in ('academy','gu','usb','uku','uor','sdb','mb','ugk','dps','udo','ukm','ovk','udk'));
alter table public.profiles drop constraint profile_department_valid;
alter table public.profiles add constraint profile_department_valid
  check (department in ('','gu','academy','usb','uku','uor','sdb','mb','ugk','dps','ukm','ovk','udk'));

-- USB retains its original records; the renamed OVK column includes their contribution.
CREATE OR REPLACE FUNCTION public.get_achievement_dashboard(p_week_start date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current date := date_trunc('week',now() at time zone 'Europe/Moscow')::date;
  v_week date := coalesce(p_week_start,v_current);
  v_goal record;
  v_dept text;
  v_value numeric;
  v_count bigint;
  v_pending bigint;
  v_reserved numeric;
  v_closed boolean;
  v_departments jsonb;
  v_items jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if extract(isodow from v_week)<>1 or v_week>v_current or v_week<v_current-364 then
    raise exception 'Invalid achievement week' using errcode='22023';
  end if;
  for v_goal in select * from private.achievement_plan(v_week) loop
    select coalesce(case v_goal.metric when 'average' then avg(quantity)::numeric
      when 'distinct-days' then count(distinct work_date)::numeric else sum(quantity)::numeric end,0),count(*)
      into v_value,v_count from private.achievement_reports
      where week_start=v_week and achievement_id=v_goal.id and delivery_status='sent';
    v_closed := v_value>=v_goal.target or exists(select 1 from private.achievement_completions
      where week_start=v_week and achievement_id=v_goal.id);
    select count(*) into v_pending from private.achievement_reports
      where week_start=v_week and achievement_id=v_goal.id and delivery_status in('sending','uncertain');
    select coalesce(case v_goal.metric when 'distinct-days' then count(distinct work_date)::numeric
      else sum(quantity)::numeric end,0) into v_reserved from private.achievement_reports
      where week_start=v_week and achievement_id=v_goal.id and delivery_status in('sending','sent','uncertain');
    v_departments := '{}'::jsonb;
    for v_dept in select unnest(array['gu','ovk','udk','sdb','uor','mb','ugk','uku','dps']) loop
      v_departments := v_departments || jsonb_build_object(v_dept,(
        select jsonb_build_object('value',coalesce(case v_goal.metric when 'average' then avg(quantity)::numeric
          when 'distinct-days' then count(distinct work_date)::numeric else sum(quantity)::numeric end,0),'reports',count(*))
        from private.achievement_reports where week_start=v_week and achievement_id=v_goal.id
          and (department=v_dept or v_dept='ovk' and department='usb') and delivery_status='sent'));
    end loop;
    v_items := v_items || jsonb_build_array(jsonb_build_object('id',v_goal.id,'target',v_goal.target,
      'value',v_value,'reports',v_count,'departments',v_departments,'closed',v_closed,'pendingReports',v_pending,
      'remaining',case when v_closed then 0 when v_goal.metric='average' then null else greatest(0,v_goal.target-v_reserved) end));
  end loop;
  select jsonb_build_object('reports',count(*),'contributors',count(distinct user_id),
    'departments',count(distinct case when department='usb' then 'ovk' else department end),'lastReportAt',max(delivered_at)) into v_result
    from private.achievement_reports where week_start=v_week and delivery_status='sent'
      and achievement_id in (select id from private.achievement_plan(v_week));
  return v_result || jsonb_build_object('weekStart',v_week,'currentWeekStart',v_current,
    'weekEndsAt',((v_week+7)::timestamp at time zone 'Europe/Moscow'),'generatedAt',now(),'items',v_items,
    'availableWeeks',(select jsonb_agg(week_start order by week_start desc) from(
      select v_current as week_start union select week_start from private.achievement_reports
        where delivery_status='sent' and week_start between v_current-364 and v_current) weeks),
    'days',(select jsonb_agg(jsonb_build_object('date',d::date,'reports',(
      select count(*) from private.achievement_reports where week_start=v_week and work_date=d::date and delivery_status='sent'
        and achievement_id in (select id from private.achievement_plan(v_week)))) order by d)
      from generate_series(v_week::timestamp,(v_week+6)::timestamp,interval '1 day') d));
end;
$function$;

notify pgrst,'reload schema';
commit;
