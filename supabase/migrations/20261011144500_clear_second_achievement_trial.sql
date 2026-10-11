-- User-requested repeat cleanup of the 2026-10-05 achievement trial week.
-- Scope narrowly and abort if the remote database changed since inspection.
do $$
declare
  v_week date := date_trunc('week', now() at time zone 'Europe/Moscow')::date;
  v_total integer;
  v_removed integer;
begin
  if v_week <> date '2026-10-05' then
    raise exception 'Achievement cleanup aborted: unexpected Moscow week %', v_week;
  end if;

  select count(*) into v_total
  from private.achievement_reports
  where week_start = v_week;

  if v_total <> 1 or not exists (
    select 1 from private.achievement_reports
    where week_start = v_week and delivery_status = 'sent'
      and achievement_id = 'discipline' and quantity = 28
  ) then
    raise exception 'Achievement cleanup aborted: expected one sent discipline/28 report; found % weekly records', v_total;
  end if;

  -- The report's private evidence keys are deleted by ON DELETE CASCADE.
  delete from private.achievement_reports
    where week_start = v_week and delivery_status = 'sent'
      and achievement_id = 'discipline' and quantity = 28;
  get diagnostics v_removed = row_count;
  if v_removed <> 1 then
    raise exception 'Achievement cleanup aborted: removed % reports, expected one', v_removed;
  end if;
end;
$$;
