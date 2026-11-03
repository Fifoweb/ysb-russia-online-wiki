begin;
set local lock_timeout = '5s';

create or replace function public.reserve_evidence_upload(p_user_id uuid,p_hash text,p_size integer,p_mime text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_upload private.evidence_uploads%rowtype; v_ticket uuid; v_retry integer;
begin
  if p_user_id is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_size is null
    or p_size not between 1 and 10485760 or p_mime is null or p_mime not in ('image/png','image/jpeg','image/webp') then
    return jsonb_build_object('result','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,23));
  v_retry:=private.claim_evidence_bucket('day:user:'||p_user_id::text,209715200,p_size,86400);
  if v_retry>0 then return jsonb_build_object('result','limit'); end if;
  v_retry:=private.claim_evidence_bucket('day:global',2147483648,p_size,86400);
  if v_retry>0 then return jsonb_build_object('result','limit'); end if;
  select * into v_upload from private.evidence_uploads where hash=p_hash for update;
  if found then
    if v_upload.status='ready' and ((v_upload.expires_at is not null and v_upload.expires_at>clock_timestamp())
      or (v_upload.expires_at is null and v_upload.updated_at>clock_timestamp()-interval '24 hours')) then
      return jsonb_build_object('result','ready','url',v_upload.url,'expiresAt',v_upload.expires_at);
    end if;
    if v_upload.status='uploading' and v_upload.updated_at>clock_timestamp()-interval '2 minutes' then
      return jsonb_build_object('result','pending');
    end if;
    -- A worker that never settled may still be alive. Keep its existing protection.
    if v_upload.status='uploading' and v_upload.updated_at>clock_timestamp()-interval '24 hours' then
      v_retry:=greatest(1,ceil(extract(epoch from v_upload.updated_at+interval '24 hours'-clock_timestamp()))::integer);
      return jsonb_build_object('result','uncertain','retryable',false,'retryAfterSeconds',v_retry);
    end if;
    -- The handler has finished this attempt. An explicit user retry is allowed
    -- after one minute; the browser never repeats the hosting POST on its own.
    if v_upload.status='uncertain' and v_upload.updated_at>clock_timestamp()-interval '60 seconds' then
      v_retry:=greatest(1,ceil(extract(epoch from v_upload.updated_at+interval '60 seconds'-clock_timestamp()))::integer);
      return jsonb_build_object('result','uncertain','retryable',true,'retryAfterSeconds',v_retry);
    end if;
  end if;
  v_ticket:=gen_random_uuid();
  insert into private.evidence_uploads(hash,ticket,user_id,size,mime,status) values(p_hash,v_ticket,p_user_id,p_size,p_mime,'uploading')
    on conflict(hash) do update set ticket=v_ticket,user_id=p_user_id,size=p_size,mime=p_mime,status='uploading',url=null,expires_at=null,updated_at=clock_timestamp();
  return jsonb_build_object('result','reserved','ticket',v_ticket);
end;
$$;
revoke all on function public.reserve_evidence_upload(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.reserve_evidence_upload(uuid,text,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
