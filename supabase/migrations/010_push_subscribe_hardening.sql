-- Re-subscribing refreshes liveness, eviction spares live endpoints, and
-- push key material must look like real browser keys.
begin;
create or replace function public.shared_push(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; member_uid uuid; ep text;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  if operation='get' then
    return jsonb_build_object('subscriptions',(select coalesce(jsonb_agg(jsonb_build_object('endpoint',s.endpoint,'member',s.member,'keys',s.keys)),'[]') from public.push_subscriptions s where household_id=hid));
  end if;
  ep := payload->>'endpoint';
  if ep is null or ep !~ '^https://' or length(ep)>1000 then raise exception 'Invalid endpoint'; end if;
  if operation='unsubscribe' then
    delete from public.push_subscriptions where household_id=hid and endpoint=ep;
    return jsonb_build_object('ok',true);
  end if;
  if operation<>'subscribe' then raise exception 'Unknown operation'; end if;
  member_uid := nullif(payload->>'member','')::uuid;
  if not exists(select 1 from public.members where household_id=hid and user_id=member_uid and name<>'Housemates') then
    raise exception 'Choose a household member' using errcode='42501';
  end if;
  -- Ranges are loose on purpose: real browsers send ~87-88 char p256dh and
  -- ~22-24 char auth base64url values and must never be rejected.
  if jsonb_typeof(payload->'keys') is distinct from 'object'
    or coalesce(payload->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{80,100}$'
    or coalesce(payload->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'Invalid subscription keys';
  end if;
  -- A household has a handful of devices; cap junk buildup from re-installs.
  -- created_at doubles as last-seen (re-subscribes refresh it below), so only
  -- new endpoints trigger eviction and the longest-silent ones go first.
  if not exists(select 1 from public.push_subscriptions where household_id=hid and endpoint=ep) then
    delete from public.push_subscriptions where household_id=hid and endpoint in
      (select endpoint from public.push_subscriptions where household_id=hid and endpoint<>ep
        order by created_at desc offset 19);
  end if;
  insert into public.push_subscriptions(endpoint,household_id,member,keys)
    values(ep,hid,member_uid,payload->'keys')
    on conflict(endpoint) do update set member=excluded.member, keys=excluded.keys, created_at=now()
    where public.push_subscriptions.household_id=excluded.household_id;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.shared_push(text,text,jsonb) from public, authenticated;
grant execute on function public.shared_push(text,text,jsonb) to anon;
commit;
