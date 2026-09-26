-- Keep the global cooldown atomic across every application function.
create or replace function public.claim_application_submission(p_user_id uuid, p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved_at timestamptz;
  v_remaining integer;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'Missing cooldown identity';
  end if;

  insert into public.application_submission_cooldowns (user_id, reserved_at, request_id)
  values (p_user_id, statement_timestamp(), p_request_id)
  on conflict (user_id) do update
    set reserved_at = excluded.reserved_at, request_id = excluded.request_id
    where public.application_submission_cooldowns.reserved_at <= excluded.reserved_at - interval '150 seconds'
  returning reserved_at into v_reserved_at;

  if found then
    return 0;
  end if;

  select greatest(1, least(150, ceil(extract(epoch from reserved_at + interval '150 seconds' - statement_timestamp()))::integer))
    into v_remaining
    from public.application_submission_cooldowns
    where user_id = p_user_id;
  return coalesce(v_remaining, 1);
end;
$$;

notify pgrst, 'reload schema';
