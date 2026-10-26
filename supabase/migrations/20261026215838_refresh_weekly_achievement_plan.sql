-- New weekly plan from 26 October; all earlier reports and plans stay intact.
begin;
insert into private.achievement_goals(id,target,metric) values ('clean-week',7,'distinct-days')
  on conflict(id) do update set target=excluded.target,metric=excluded.metric;
update private.achievement_goals set target=2 where id='joint-exercises';
create unique index if not exists achievement_clean_week_day on private.achievement_reports(week_start,work_date)
  where achievement_id='clean-week' and delivery_status in ('sending','sent','uncertain');

CREATE OR REPLACE FUNCTION public.reserve_achievement_report(p_user_id uuid, p_request_id uuid, p_discord_id text, p_discord_name text, p_body jsonb, p_fingerprint text, p_keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existing private.achievement_reports%rowtype;
  v_goal private.achievement_goals%rowtype;
  v_id uuid;
  v_today date := (clock_timestamp() at time zone 'Europe/Moscow')::date;
  v_week date := date_trunc('week',clock_timestamp() at time zone 'Europe/Moscow')::date;
  v_date date;
  v_time time;
  v_quantity integer;
  v_value numeric;
  v_reserved numeric;
  v_pending bigint;
  v_remaining integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || p_request_id::text,0));
  select * into v_goal from private.achievement_goals where id=p_body->>'achievementId';
  if not found or v_goal.id in ('airdrop','escorts') or p_body->>'rulesAccepted' is distinct from 'true' then
    return jsonb_build_object('result','invalid');
  end if;
  -- Every applicant for the same goal/week shares this lock. Pending deliveries
  -- reserve capacity too; two simultaneous final reports cannot overshoot.
  perform pg_advisory_xact_lock(hashtextextended(v_week::text || ':' || v_goal.id,1));
  if v_week<>date_trunc('week',clock_timestamp() at time zone 'Europe/Moscow')::date then
    return jsonb_build_object('result','invalid');
  end if;
  v_date := (p_body->>'workDate')::date;
  v_quantity := (p_body->>'quantity')::integer;
  v_time := (p_body->>'workTime')::time;
  if v_date<v_week or v_date>v_today or v_quantity<(case when v_goal.metric='average' then 0 else 1 end)
    or v_quantity>99999 or (v_goal.metric='distinct-days' and v_quantity<>1)
    or cardinality(p_keys) not between 1 and 50 or cardinality(p_keys)<>jsonb_array_length(p_body->'evidence') then
    return jsonb_build_object('result','invalid');
  end if;
  if v_time is null or (v_date+v_time) at time zone 'Europe/Moscow'>clock_timestamp()
    or (v_date+v_time)<v_week::timestamp+interval '1 minute'
    or clock_timestamp()<(v_week::timestamp+interval '1 minute') at time zone 'Europe/Moscow' then
    return jsonb_build_object('result','invalid');
  end if;
  select * into v_existing from private.achievement_reports
    where user_id=p_user_id and request_id=p_request_id for update;
  if found then
    if v_existing.fingerprint<>p_fingerprint then return jsonb_build_object('result','changed'); end if;
    if v_existing.delivery_status='excluded' then return jsonb_build_object('result','closed',
      'reopensAt',(v_week+7)::timestamp at time zone 'Europe/Moscow'); end if;
    -- An already delivered retry is still acknowledged after goal completion.
    if v_existing.delivery_status<>'failed' then
      return jsonb_build_object('result',v_existing.delivery_status,'id',v_existing.id);
    end if;
    v_id := v_existing.id;
  end if;
  select coalesce(case v_goal.metric when 'average' then avg(quantity)::numeric
    when 'distinct-days' then count(distinct work_date)::numeric else sum(quantity)::numeric end,0)
    into v_value from private.achievement_reports
    where week_start=v_week and achievement_id=v_goal.id and delivery_status='sent';
  if v_value>=v_goal.target or exists(select 1 from private.achievement_completions
    where week_start=v_week and achievement_id=v_goal.id) then
    insert into private.achievement_completions(week_start,achievement_id) values(v_week,v_goal.id) on conflict do nothing;
    return jsonb_build_object('result','closed','reopensAt',(v_week+7)::timestamp at time zone 'Europe/Moscow');
  end if;
  select count(*) into v_pending from private.achievement_reports
    where week_start=v_week and achievement_id=v_goal.id and delivery_status in('sending','uncertain');
  if v_goal.metric='average' then
    -- A late low measurement must not undo completion by an earlier delivery.
    if v_pending>0 then return jsonb_build_object('result','pending'); end if;
  else
    select coalesce(case v_goal.metric when 'distinct-days' then count(distinct work_date)::numeric
      else sum(quantity)::numeric end,0) into v_reserved from private.achievement_reports
      where week_start=v_week and achievement_id=v_goal.id and delivery_status in('sending','sent','uncertain');
    v_remaining := greatest(0,v_goal.target-v_reserved)::integer;
    if v_remaining=0 then return jsonb_build_object('result','pending'); end if;
    if v_quantity>v_remaining then return jsonb_build_object('result','limit','remaining',v_remaining); end if;
  end if;
  if v_id is not null then
    update private.achievement_reports set delivery_status='sending',created_at=now(),week_start=v_week,
      discord_message_id=null,delivered_at=null where id=v_id;
  else
    insert into private.achievement_reports(user_id,request_id,fingerprint,discord_id,discord_name,full_name,
      static_id,department,achievement_id,quantity,week_start,work_date,work_time,evidence)
    values(p_user_id,p_request_id,p_fingerprint,p_discord_id,left(p_discord_name,80),p_body->>'fullName',
      p_body->>'staticId',p_body->>'department',v_goal.id,v_quantity,v_week,v_date,v_time,p_body->'evidence') returning id into v_id;
  end if;
  insert into private.achievement_evidence(week_start,url_key,report_id)
    select v_week,key,v_id from unnest(p_keys) as key;
  return jsonb_build_object('result','reserved','id',v_id,'weekStart',v_week);
exception when unique_violation then return jsonb_build_object('result','duplicate');
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_achievement_report(p_report_id uuid, p_status text, p_message_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_report private.achievement_reports%rowtype;
  v_goal private.achievement_goals%rowtype;
  v_value numeric;
  v_target integer;
  v_delivery_status text := p_status;
  v_credited_quantity integer;
begin
  if p_status not in('sent','failed','uncertain') or (p_status='sent' and p_message_id !~ '^\d{17,20}$')
    or (p_status='sent' and p_message_id is null) then return false; end if;
  select * into v_report from private.achievement_reports where id=p_report_id;
  if not found then return false; end if;
  -- Same lock order as reservation: goal/week first, then report row.
  perform pg_advisory_xact_lock(hashtextextended(v_report.week_start::text || ':' || v_report.achievement_id,1));
  select * into v_report from private.achievement_reports where id=p_report_id for update;
  if not found then return false; end if;
  if v_report.delivery_status in('sent','excluded') then
    return p_status='sent' and v_report.discord_message_id=p_message_id;
  end if;
  if v_report.delivery_status not in('sending','uncertain') then return false; end if;
  v_credited_quantity := v_report.quantity;
  if p_status='sent' then
    select * into v_goal from private.achievement_goals where id=v_report.achievement_id;
    v_target := case when v_goal.id='joint-exercises' and v_report.week_start>=date '2026-10-12' and v_report.week_start<date '2026-10-26' then 3 else v_goal.target end;
    select coalesce(case v_goal.metric when 'average' then avg(quantity)::numeric
      when 'distinct-days' then count(distinct work_date)::numeric else sum(quantity)::numeric end,0)
      into v_value from private.achievement_reports where week_start=v_report.week_start
        and achievement_id=v_goal.id and delivery_status='sent';
    -- An older deployed worker may already have reserved a report before this
    -- migration. Confirm its Discord delivery without reopening or overflowing
    -- a goal that was completed while that worker was sending.
    if v_value>=v_target or exists(select 1 from private.achievement_completions
      where week_start=v_report.week_start and achievement_id=v_goal.id) then
      v_delivery_status := 'excluded';
    elsif v_goal.metric='sum' then
      v_credited_quantity := least(v_report.quantity,greatest(0,v_target-v_value)::integer);
    end if;
  end if;
  update private.achievement_reports set delivery_status=v_delivery_status,quantity=v_credited_quantity,discord_message_id=p_message_id,
    delivered_at=case when p_status='sent' then now() else null end
    where id=p_report_id and delivery_status in('sending','uncertain');
  if not found then return false; end if;
  if p_status='failed' then delete from private.achievement_evidence where report_id=p_report_id; end if;
  if p_status='sent' and v_delivery_status='sent' then
    select coalesce(case v_goal.metric when 'average' then avg(quantity)::numeric
      when 'distinct-days' then count(distinct work_date)::numeric else sum(quantity)::numeric end,0)
      into v_value from private.achievement_reports where week_start=v_report.week_start
        and achievement_id=v_goal.id and delivery_status='sent';
    if v_value>=v_target then insert into private.achievement_completions(week_start,achievement_id)
      values(v_report.week_start,v_goal.id) on conflict do nothing; end if;
  end if;
  return true;
end;
$function$;

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
  for v_goal in select id,metric,case when id='joint-exercises' and v_week>=date '2026-10-12' and v_week<date '2026-10-26' then 3 else target end as target
    from private.achievement_goals where (v_week<date '2026-10-12' and id not in('motorcyclists','airdrop','clean-week'))
      or (v_week>=date '2026-10-12' and v_week<date '2026-10-26' and id not in('escorts','clean-week'))
      or (v_week>=date '2026-10-26' and id not in('escorts','airdrop')) order by id loop
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
    for v_dept in select unnest(array['gu','usb','uku','uor','sdb','mb','ugk','dps']) loop
      v_departments := v_departments || jsonb_build_object(v_dept,(
        select jsonb_build_object('value',coalesce(case v_goal.metric when 'average' then avg(quantity)::numeric
          when 'distinct-days' then count(distinct work_date)::numeric else sum(quantity)::numeric end,0),'reports',count(*))
        from private.achievement_reports where week_start=v_week and achievement_id=v_goal.id
          and department=v_dept and delivery_status='sent'));
    end loop;
    v_items := v_items || jsonb_build_array(jsonb_build_object('id',v_goal.id,'target',v_goal.target,
      'value',v_value,'reports',v_count,'departments',v_departments,'closed',v_closed,'pendingReports',v_pending,
      'remaining',case when v_closed then 0 when v_goal.metric='average' then null else greatest(0,v_goal.target-v_reserved) end));
  end loop;
  select jsonb_build_object('reports',count(*),'contributors',count(distinct user_id),
    'departments',count(distinct department),'lastReportAt',max(delivered_at)) into v_result
    from private.achievement_reports where week_start=v_week and delivery_status='sent';
  return v_result || jsonb_build_object('weekStart',v_week,'currentWeekStart',v_current,
    'weekEndsAt',((v_week+7)::timestamp at time zone 'Europe/Moscow'),'generatedAt',now(),'items',v_items,
    'availableWeeks',(select jsonb_agg(week_start order by week_start desc) from(
      select v_current as week_start union select week_start from private.achievement_reports
        where delivery_status='sent' and week_start between v_current-364 and v_current) weeks),
    'days',(select jsonb_agg(jsonb_build_object('date',d::date,'reports',(
      select count(*) from private.achievement_reports where week_start=v_week and work_date=d::date and delivery_status='sent')) order by d)
      from generate_series(v_week::timestamp,(v_week+6)::timestamp,interval '1 day') d));
end;
$function$;

-- Mark any existing current-week progress that already meets the lowered target.
insert into private.achievement_completions(week_start,achievement_id)
select week_start,achievement_id from private.achievement_reports
where week_start>=date '2026-10-26' and achievement_id='joint-exercises' and delivery_status='sent'
group by week_start,achievement_id having sum(quantity)>=2 on conflict do nothing;
commit;
