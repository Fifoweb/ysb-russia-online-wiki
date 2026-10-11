-- One-time removal of the requested trial report from the initial dashboard week.
-- Do not reset other users, unrelated application tables, or the future weekly archive.
do $$
declare
  v_matches integer;
begin
  select count(*) into v_matches
    from private.achievement_reports
    where week_start = date '2026-10-05'
      and discord_id = '1019177843793600563'
      and static_id = '9923'
      and full_name = 'Мирон Комиссаров'
      and department = 'udo'
      and achievement_id = 'academy-graduates'
      and quantity = 20
      and delivery_status = 'sent';

  if v_matches <> 1 then
    raise exception 'Trial cleanup aborted: expected exactly one report, found %', v_matches;
  end if;

  -- private.achievement_evidence is deleted automatically by ON DELETE CASCADE.
  delete from private.achievement_reports
    where week_start = date '2026-10-05'
      and discord_id = '1019177843793600563'
      and static_id = '9923'
      and full_name = 'Мирон Комиссаров'
      and department = 'udo'
      and achievement_id = 'academy-graduates'
      and quantity = 20
      and delivery_status = 'sent';
end;
$$;
