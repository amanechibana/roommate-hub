-- Web push subscriptions, one row per browser or installed app endpoint.
begin;
create table public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and length(endpoint) <= 1000),
  household_id uuid not null references public.households(id),
  member uuid not null references public.members(user_id),
  keys jsonb not null check (jsonb_typeof(keys) = 'object'),
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions(household_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;

create function public.shared_push(access_token text, operation text, payload jsonb default '{}')
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
  if jsonb_typeof(payload->'keys') is distinct from 'object'
    or payload->'keys'->>'p256dh' is null or payload->'keys'->>'auth' is null then
    raise exception 'Invalid subscription keys';
  end if;
  -- A household has a handful of devices; cap junk buildup from re-installs.
  delete from public.push_subscriptions where household_id=hid and endpoint in
    (select endpoint from public.push_subscriptions where household_id=hid
      order by created_at desc offset 19);
  insert into public.push_subscriptions(endpoint,household_id,member,keys)
    values(ep,hid,member_uid,payload->'keys')
    on conflict(endpoint) do update set member=excluded.member, keys=excluded.keys
    where public.push_subscriptions.household_id=excluded.household_id;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.shared_push(text,text,jsonb) from public, authenticated;
grant execute on function public.shared_push(text,text,jsonb) to anon;
commit;
