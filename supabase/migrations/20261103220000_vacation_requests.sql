begin;
set local lock_timeout='5s';
create table public.vacation_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  department text not null default '',
  leadership text not null,
  reason text not null check (length(reason) between 3 and 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  delivery_status text not null check (delivery_status in ('sending','delivered','failed','uncertain')),
  created_at timestamptz not null default now(),
  message_id text,
  check (ends_at > starts_at and ends_at <= starts_at + interval '366 days')
);
create unique index vacation_one_pending_per_user on public.vacation_requests(user_id)
  where delivery_status in ('sending','uncertain');
alter table public.vacation_requests enable row level security;
revoke all on public.vacation_requests from public,anon,authenticated;
grant select on public.vacation_requests to authenticated;
grant all on public.vacation_requests to service_role;
create policy "own vacations" on public.vacation_requests for select to authenticated
  using (user_id=(select auth.uid()));

create function public.list_vacations()
returns table(display_name text, department text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path='' as $$
  select v.display_name,v.department,v.starts_at,v.ends_at from public.vacation_requests v
  where v.delivery_status='delivered' and v.ends_at>now()
  order by v.starts_at,v.display_name limit 500;
$$;
revoke all on function public.list_vacations() from public,anon,authenticated;
grant execute on function public.list_vacations() to authenticated;

-- Serialize each employee's requests. Known rejections can be retried, while
-- unknown delivery outcomes never cause a second Discord message.
create function public.reserve_vacation(p_id uuid,p_user_id uuid,p_name text,p_department text,p_leadership text,p_reason text,p_start timestamptz,p_end timestamptz)
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
  if exists(select 1 from public.vacation_requests where user_id=p_user_id and delivery_status='delivered' and starts_at<p_end and ends_at>p_start) then return 'overlap'; end if;
  insert into public.vacation_requests(id,user_id,display_name,department,leadership,reason,starts_at,ends_at,delivery_status)
    values(p_id,p_user_id,p_name,p_department,p_leadership,p_reason,p_start,p_end,'sending')
    on conflict(id) do update set display_name=p_name,department=p_department,leadership=p_leadership,reason=p_reason,starts_at=p_start,ends_at=p_end,delivery_status='sending',created_at=now();
  return 'reserved';
end;
$$;
revoke all on function public.reserve_vacation(uuid,uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_vacation(uuid,uuid,text,text,text,text,timestamptz,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
