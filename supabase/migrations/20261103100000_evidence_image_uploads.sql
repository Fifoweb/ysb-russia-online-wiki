begin;
set local lock_timeout = '5s';

create table private.evidence_upload_buckets (
  bucket text primary key,
  started_at timestamptz not null,
  amount bigint not null check(amount>=0)
);
create table private.evidence_uploads (
  hash text primary key check(hash ~ '^[a-f0-9]{64}$'),
  ticket uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  size integer not null check(size between 1 and 10485760),
  mime text not null check(mime in ('image/png','image/jpeg','image/webp')),
  status text not null check(status in ('uploading','ready','failed','uncertain')),
  url text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check(status<>'ready' or (url is not null and url ~ '^https://allwebs[.]ru/images/[a-zA-Z0-9/_.-]+[.](png|jpe?g|webp)$'))
);
alter table private.evidence_upload_buckets enable row level security;
alter table private.evidence_uploads enable row level security;
revoke all on private.evidence_upload_buckets,private.evidence_uploads from public,anon,authenticated;
grant all on private.evidence_upload_buckets,private.evidence_uploads to service_role;

create function private.claim_evidence_bucket(p_bucket text,p_limit bigint,p_cost bigint,p_seconds integer)
returns integer language plpgsql set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_start timestamptz; v_amount bigint;
begin
  insert into private.evidence_upload_buckets(bucket,started_at,amount) values(p_bucket,v_now,0) on conflict do nothing;
  select started_at,amount into v_start,v_amount from private.evidence_upload_buckets where bucket=p_bucket for update;
  if v_start<=v_now-make_interval(secs=>p_seconds) then v_start:=v_now; v_amount:=0; end if;
  if v_amount+p_cost>p_limit then return greatest(1,ceil(extract(epoch from v_start+make_interval(secs=>p_seconds)-v_now))::integer); end if;
  update private.evidence_upload_buckets set started_at=v_start,amount=v_amount+p_cost where bucket=p_bucket;
  return 0;
end;
$$;
revoke all on function private.claim_evidence_bucket(text,bigint,bigint,integer) from public,anon,authenticated;

create function public.claim_evidence_upload_attempt(p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_retry integer;
begin
  if p_user_id is null then raise exception 'Missing upload identity'; end if;
  -- These buckets are independent of report attempts and report cooldowns.
  v_retry:=private.claim_evidence_bucket('minute:user:'||p_user_id::text,60,1,60);
  if v_retry>0 then return v_retry; end if;
  return private.claim_evidence_bucket('minute:global',240,1,60);
end;
$$;

create function public.reserve_evidence_upload(p_user_id uuid,p_hash text,p_size integer,p_mime text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_upload private.evidence_uploads%rowtype; v_ticket uuid; v_retry integer;
begin
  if p_user_id is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_size is null
    or p_size not between 1 and 10485760 or p_mime is null or p_mime not in ('image/png','image/jpeg','image/webp') then
    return jsonb_build_object('result','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,23));
  -- Count request bytes even when the image can be served from the cache.
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
    if v_upload.status='uploading' and v_upload.updated_at>clock_timestamp()-interval '2 minutes' then return jsonb_build_object('result','pending'); end if;
    -- An interrupted request may already have reached Allwebs. Never resend it automatically.
    if v_upload.status in ('uploading','uncertain') and v_upload.updated_at>clock_timestamp()-interval '24 hours' then
      return jsonb_build_object('result','uncertain');
    end if;
  end if;
  v_ticket:=gen_random_uuid();
  insert into private.evidence_uploads(hash,ticket,user_id,size,mime,status) values(p_hash,v_ticket,p_user_id,p_size,p_mime,'uploading')
    on conflict(hash) do update set ticket=v_ticket,user_id=p_user_id,size=p_size,mime=p_mime,status='uploading',url=null,expires_at=null,updated_at=clock_timestamp();
  return jsonb_build_object('result','reserved','ticket',v_ticket);
end;
$$;

create function public.settle_evidence_upload(p_hash text,p_ticket uuid,p_status text,p_url text default null,p_expires_at timestamptz default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_upload private.evidence_uploads%rowtype;
begin
  if p_hash is null or p_ticket is null then return false; end if;
  if p_status is null or p_status not in ('ready','failed','uncertain') then return false; end if;
  if p_status='ready' and (p_url is null or length(p_url)>300 or p_url !~ '^https://allwebs[.]ru/images/[a-zA-Z0-9/_.-]+[.](png|jpe?g|webp)$') then return false; end if;
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
revoke all on function public.claim_evidence_upload_attempt(uuid),public.reserve_evidence_upload(uuid,text,integer,text),public.settle_evidence_upload(text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_evidence_upload_attempt(uuid),public.reserve_evidence_upload(uuid,text,integer,text),public.settle_evidence_upload(text,uuid,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
