-- Claim Discord interaction IDs atomically so replayed signed requests cannot run twice.
create table if not exists public.discord_interaction_receipts (
  interaction_id text primary key check (interaction_id ~ '^[0-9]{17,20}$'),
  received_at timestamptz not null default now()
);

create index if not exists discord_interaction_receipts_received_at_idx
  on public.discord_interaction_receipts (received_at);

alter table public.discord_interaction_receipts enable row level security;
revoke all on public.discord_interaction_receipts from public, anon, authenticated;

create or replace function public.claim_discord_interaction(p_interaction_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed text;
begin
  if p_interaction_id is null or p_interaction_id !~ '^[0-9]{17,20}$' then
    raise exception 'Invalid Discord interaction ID';
  end if;

  insert into public.discord_interaction_receipts (interaction_id)
    values (p_interaction_id)
    on conflict (interaction_id) do nothing
    returning interaction_id into v_claimed;

  -- Opportunistic retention cleanup. The signed timestamp is checked separately.
  if random() < 0.01 then
    delete from public.discord_interaction_receipts
      where received_at < now() - interval '24 hours';
  end if;
  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_discord_interaction(text) from public, anon, authenticated;
grant execute on function public.claim_discord_interaction(text) to service_role;
notify pgrst, 'reload schema';
