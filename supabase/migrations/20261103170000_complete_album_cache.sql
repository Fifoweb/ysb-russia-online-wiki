begin;
set local lock_timeout='5s';
create index evidence_uploads_ready_url_idx on private.evidence_uploads(url) where status='ready';
create function public.is_complete_evidence_album(p_user_id uuid,p_url text,p_hashes text[])
returns boolean language sql stable security definer set search_path='' as $$
  select p_user_id is not null and p_url is not null and p_hashes is not null
    and cardinality(p_hashes) between 1 and 50
    and not exists(select 1 from unnest(p_hashes) as selected(hash) where hash is null or hash !~ '^[a-f0-9]{64}$')
    and p_url ~ '^https://fotora[.]ru/uploaded/[?]ID=[A-Za-z0-9]{5,64}$'
    and exists(select 1 from private.evidence_uploads where url=p_url and status='ready' and user_id=p_user_id)
    and not exists(select 1 from private.evidence_uploads where url=p_url and status='ready'
      and (user_id<>p_user_id or not (hash=any(p_hashes))));
$$;
revoke all on function public.is_complete_evidence_album(uuid,text,text[]) from public,anon,authenticated;
grant execute on function public.is_complete_evidence_album(uuid,text,text[]) to service_role;
notify pgrst,'reload schema';
commit;
