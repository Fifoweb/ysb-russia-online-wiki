-- Database fixtures only. No images or reports leave this transaction.
begin;
set local statement_timeout='15s';
insert into auth.users(id,aud,role) values
  ('00000000-0000-4000-8000-00000000f301','authenticated','authenticated'),
  ('00000000-0000-4000-8000-00000000f302','authenticated','authenticated');

do $$
declare
  v_user uuid:='00000000-0000-4000-8000-00000000f301';
  v_other uuid:='00000000-0000-4000-8000-00000000f302';
  v_result jsonb; v_ticket uuid; v_second uuid; v_retry integer; v_i integer;
begin
  if has_table_privilege('anon','private.evidence_uploads','select')
    or has_table_privilege('authenticated','private.evidence_uploads','insert')
    or has_function_privilege('authenticated','public.reserve_evidence_upload(uuid,text,integer,text)','execute')
    or has_function_privilege('anon','public.claim_evidence_upload_attempt(uuid)','execute') then
    raise exception 'Private upload privileges leaked';
  end if;
  for v_i in 1..60 loop
    v_retry:=public.claim_evidence_upload_attempt(v_user);
    if v_retry<>0 then raise exception 'Upload attempts blocked before the per-user limit'; end if;
  end loop;
  v_retry:=public.claim_evidence_upload_attempt(v_user);
  if v_retry not between 1 and 60 then raise exception 'Upload attempt limit not enforced'; end if;
  if exists(select 1 from public.application_request_limits where bucket='user:'||v_user::text) then
    raise exception 'Image uploads spent the report request limit';
  end if;
  v_result:=public.reserve_evidence_upload(v_user,repeat('a',64),100,'image/png');
  if v_result->>'result'<>'reserved' then raise exception 'First upload not reserved'; end if;
  v_ticket:=(v_result->>'ticket')::uuid;
  v_result:=public.reserve_evidence_upload(v_other,repeat('a',64),100,'image/png');
  if v_result->>'result'<>'pending' then raise exception 'Same image uploaded twice concurrently'; end if;
  if public.settle_evidence_upload(repeat('a',64),gen_random_uuid(),'ready','https://allwebs.ru/images/2026/proof.png',now()+interval '1 day') then
    raise exception 'A stale ticket could overwrite an upload';
  end if;
  if public.settle_evidence_upload(repeat('a',64),null,'ready','https://allwebs.ru/images/2026/proof.png',null) then
    raise exception 'A missing ticket could settle an upload';
  end if;
  if public.settle_evidence_upload(repeat('a',64),v_ticket,'ready','https://evil.test/proof.png',null) then
    raise exception 'Untrusted hosting URL accepted';
  end if;
  if not public.settle_evidence_upload(repeat('a',64),v_ticket,'ready','https://allwebs.ru/images/2026/proof.png',now()+interval '1 day') then
    raise exception 'Confirmed upload was not cached';
  end if;
  if not public.settle_evidence_upload(repeat('a',64),v_ticket,'ready','https://allwebs.ru/images/2026/proof.png',now()+interval '1 day') then
    raise exception 'Settlement retry was not idempotent';
  end if;
  v_result:=public.reserve_evidence_upload(v_other,repeat('a',64),100,'image/png');
  if v_result->>'result'<>'ready' or v_result->>'url'<>'https://allwebs.ru/images/2026/proof.png' then
    raise exception 'A repeated original image did not reuse its existing link';
  end if;
  v_result:=public.reserve_evidence_upload(v_user,repeat('b',64),100,'image/png');v_ticket:=(v_result->>'ticket')::uuid;
  perform public.settle_evidence_upload(repeat('b',64),v_ticket,'uncertain');
  v_result:=public.reserve_evidence_upload(v_user,repeat('b',64),100,'image/png');
  if v_result->>'result'<>'uncertain' or (v_result->>'retryable')::boolean is not true
    or (v_result->>'retryAfterSeconds')::integer not between 1 and 60 then
    raise exception 'Unconfirmed hosting upload did not enforce the short manual retry delay';
  end if;
  -- One unsuccessful file does not block a different screenshot from the same user.
  v_result:=public.reserve_evidence_upload(v_user,repeat('e',64),100,'image/png');
  if v_result->>'result'<>'reserved' then raise exception 'A different screenshot was blocked after a timeout'; end if;
  update private.evidence_uploads set updated_at=clock_timestamp()-interval '61 seconds' where hash=repeat('b',64);
  v_result:=public.reserve_evidence_upload(v_user,repeat('b',64),100,'image/png');v_second:=(v_result->>'ticket')::uuid;
  if v_result->>'result'<>'reserved' or v_second=v_ticket then raise exception 'Explicit retry remained blocked after one minute'; end if;
  if public.settle_evidence_upload(repeat('b',64),v_ticket,'ready','https://allwebs.ru/images/2026/stale.png',null) then raise exception 'Old ticket overwrote a newer reservation'; end if;
  update private.evidence_upload_buckets set amount=209715200 where bucket='day:user:'||v_user::text;
  v_result:=public.reserve_evidence_upload(v_user,repeat('c',64),100,'image/png');
  if v_result->>'result'<>'limit' then raise exception 'Daily image byte quota not enforced'; end if;
  v_result:=public.reserve_evidence_upload(v_other,repeat('d',64),10485761,'image/png');
  if v_result->>'result'<>'invalid' then raise exception 'Oversized reservation accepted'; end if;
end;
$$;
rollback;
