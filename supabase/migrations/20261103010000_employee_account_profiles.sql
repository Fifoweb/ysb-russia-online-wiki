-- Employee data belongs to the existing Discord-linked Auth user, never to a client-supplied Discord ID.
begin;
set local lock_timeout = '5s';

alter table public.profiles
  add column game_nickname text not null default '',
  add column static_id text not null default '',
  add column department text not null default '';

-- Empty values keep existing profiles compatible until their owners complete the new fields.
alter table public.profiles
  add constraint profile_game_nickname_valid check (game_nickname='' or
    (game_nickname=btrim(game_nickname) and length(game_nickname) between 3 and 80 and game_nickname !~ '[[:cntrl:]]')),
  add constraint profile_static_id_valid check (static_id='' or static_id ~ '^[0-9]{1,10}$'),
  add constraint profile_department_valid check (department in ('','gu','academy','usb','uku','uor','sdb','mb','ugk','dps','ukm'));

create function public.set_profile_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_profile_updated_at() from public,anon,authenticated;
create trigger profile_updated_at before insert or update on public.profiles
  for each row execute function public.set_profile_updated_at();

alter table public.profiles enable row level security;
alter policy "own profile" on public.profiles to authenticated
  using ((select auth.uid())=id) with check ((select auth.uid())=id);
revoke all on public.profiles from anon;
grant select,insert,update,delete on public.profiles to authenticated;

notify pgrst, 'reload schema';
commit;
