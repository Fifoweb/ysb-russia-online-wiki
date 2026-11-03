begin;
set local lock_timeout='5s';
alter table public.vacation_requests add column cancelled_at timestamptz;
alter table public.vacation_requests add constraint vacation_cancel_before_start
  check (cancelled_at is null or (cancelled_at < starts_at and returned_at is null));

create function public.cancel_my_vacation(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_row public.vacation_requests; v_now timestamptz;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,7081));
  select * into v_row from public.vacation_requests where id=p_id and user_id=v_user for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_row.delivery_status<>'delivered' then return jsonb_build_object('status','not_upcoming'); end if;
  if v_row.cancelled_at is not null then return jsonb_build_object('status','cancelled','id',v_row.id,'cancelled_at',v_row.cancelled_at); end if;
  v_now:=clock_timestamp();
  if v_row.starts_at<=v_now or v_row.returned_at is not null then return jsonb_build_object('status','not_upcoming'); end if;
  update public.vacation_requests set cancelled_at=v_now where id=v_row.id;
  return jsonb_build_object('status','cancelled','id',v_row.id,'cancelled_at',v_now);
end;
$$;
revoke all on function public.cancel_my_vacation(uuid) from public,anon,authenticated;
grant execute on function public.cancel_my_vacation(uuid) to authenticated;

create or replace function public.end_my_vacation(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_row public.vacation_requests; v_now timestamptz;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,7081));
  select * into v_row from public.vacation_requests where id=p_id and user_id=v_user for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_row.delivery_status<>'delivered' or v_row.cancelled_at is not null then return jsonb_build_object('status','not_active'); end if;
  if v_row.returned_at is not null then return jsonb_build_object('status','ended','id',v_row.id,'returned_at',v_row.returned_at); end if;
  v_now:=clock_timestamp();
  if v_row.starts_at>v_now or v_row.ends_at<=v_now then return jsonb_build_object('status','not_active'); end if;
  update public.vacation_requests set returned_at=v_now where id=v_row.id;
  return jsonb_build_object('status','ended','id',v_row.id,'returned_at',v_now);
end;
$$;

create or replace function public.list_vacations()
returns table(display_name text, department text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path='' as $$
  select v.display_name,v.department,v.starts_at,v.ends_at from public.vacation_requests v
  where v.delivery_status='delivered' and v.ends_at>now() and v.returned_at is null and v.cancelled_at is null
  order by v.starts_at,v.display_name limit 500;
$$;

create or replace function public.reserve_vacation(p_id uuid,p_user_id uuid,p_name text,p_department text,p_leadership text,p_reason text,p_start timestamptz,p_end timestamptz)
returns text language plpgsql security definer set search_path='' as $$
declare v_old public.vacation_requests;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,7081));
  select * into v_old from public.vacation_requests where id=p_id for update;
  if found then
    if v_old.user_id<>p_user_id then return 'conflict'; end if;
    if v_old.delivery_status='delivered' then return 'delivered'; end if;
    if v_old.delivery_status<>'failed' then return 'uncertain'; end if;
  end if;
  if exists(select 1 from public.vacation_requests where user_id=p_user_id and delivery_status in ('sending','uncertain')) then return 'uncertain'; end if;
  if exists(select 1 from public.vacation_requests where user_id=p_user_id and delivery_status='delivered' and cancelled_at is null and starts_at<p_end and coalesce(returned_at,ends_at)>p_start) then return 'overlap'; end if;
  insert into public.vacation_requests(id,user_id,display_name,department,leadership,reason,starts_at,ends_at,delivery_status)
    values(p_id,p_user_id,p_name,p_department,p_leadership,p_reason,p_start,p_end,'sending')
    on conflict(id) do update set display_name=p_name,department=p_department,leadership=p_leadership,reason=p_reason,starts_at=p_start,ends_at=p_end,delivery_status='sending',created_at=now();
  return 'reserved';
end;
$$;
notify pgrst,'reload schema';
commit;
