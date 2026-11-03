begin;
set local lock_timeout = '5s';

create function private.valid_evidence_hosting_url(p_url text)
returns boolean language sql immutable strict set search_path = '' as $$
  select length(p_url)<=300 and (
    p_url ~ '^https://allwebs[.]ru/images/[a-zA-Z0-9/_.-]+[.](png|jpe?g|webp)$'
    or p_url ~ '^https://fotora[.]ru/uploaded/[?]ID=[A-Za-z0-9]{5,64}$'
  );
$$;
revoke all on function private.valid_evidence_hosting_url(text) from public,anon,authenticated;
grant execute on function private.valid_evidence_hosting_url(text) to service_role;
alter table private.evidence_uploads drop constraint evidence_uploads_check;
alter table private.evidence_uploads add constraint evidence_uploads_check
  check(status<>'ready' or (url is not null and private.valid_evidence_hosting_url(url)));

create or replace function public.settle_evidence_upload(p_hash text,p_ticket uuid,p_status text,p_url text default null,p_expires_at timestamptz default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_upload private.evidence_uploads%rowtype;
begin
  if p_hash is null or p_ticket is null then return false; end if;
  if p_status is null or p_status not in ('ready','failed','uncertain') then return false; end if;
  if p_status='ready' and (p_url is null or not private.valid_evidence_hosting_url(p_url)) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,23));
  select * into v_upload from private.evidence_uploads where hash=p_hash for update;
  if not found or v_upload.ticket<>p_ticket then return false; end if;
  if v_upload.status='ready' then return p_status='ready' and v_upload.url=p_url; end if;
  if v_upload.status not in ('uploading','uncertain') then return v_upload.status=p_status; end if;
  update private.evidence_uploads set status=p_status,url=case when p_status='ready' then p_url else null end,
    expires_at=case when p_status='ready' then p_expires_at else null end,updated_at=clock_timestamp() where hash=p_hash;
  return true;
end;
$$;
revoke all on function public.settle_evidence_upload(text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.settle_evidence_upload(text,uuid,text,text,timestamptz) to service_role;

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
      -- Possessing one photo must not disclose the other photos in somebody else's album.
      if v_upload.url like 'https://fotora.ru/%' and v_upload.user_id<>p_user_id then
        return jsonb_build_object('result','duplicate');
      end if;
      return jsonb_build_object('result','ready','url',v_upload.url,'expiresAt',v_upload.expires_at);
    end if;
    if v_upload.status='uploading' and v_upload.updated_at>clock_timestamp()-interval '2 minutes' then return jsonb_build_object('result','pending'); end if;
    if v_upload.status='uploading' and v_upload.updated_at>clock_timestamp()-interval '24 hours' then
      v_retry:=greatest(1,ceil(extract(epoch from v_upload.updated_at+interval '24 hours'-clock_timestamp()))::integer);
      return jsonb_build_object('result','uncertain','retryable',false,'retryAfterSeconds',v_retry);
    end if;
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
