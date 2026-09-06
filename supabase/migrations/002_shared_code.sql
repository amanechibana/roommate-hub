-- Run with psql -v gateway_hash=<SHA-256 of HOUSEHOLD_DATA_TOKEN>.
-- The actual access code and gateway token are never stored in this schema.
begin;
create table public.shared_home_config (
  singleton boolean primary key default true check (singleton),
  household_id uuid not null references public.households(id),
  gateway_hash text not null check (length(gateway_hash) = 64)
);
create table public.shared_login_attempts (
  fingerprint text primary key,
  started_at timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.shared_home_config enable row level security;
alter table public.shared_login_attempts enable row level security;
revoke all on public.shared_home_config, public.shared_login_attempts from public, anon, authenticated;

do $$ declare hid uuid; uid uuid; begin
  if (select count(*) from public.households) > 1 then
    raise exception 'Choose a household explicitly before enabling shared access.';
  end if;
  select id into hid from public.households limit 1;
  if hid is null then
    uid := gen_random_uuid();
    insert into auth.users(id) values(uid);
    insert into public.households(name,owner_id) values('Our home',uid) returning id into hid;
    insert into public.members(user_id,household_id,name) values(uid,hid,'Housemates');
  end if;
  -- Hash is populated below, in the same transaction.
  insert into public.shared_home_config(household_id,gateway_hash) values(hid,repeat('0',64));
end $$;
update public.shared_home_config set gateway_hash = :'gateway_hash';

create function public.shared_home(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; owner_uid uuid; row_data public.entries; affected integer; n integer; person_id uuid;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash = encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode = '42501'; end if;
  select owner_id into owner_uid from public.households where id=hid;
  if operation = 'attempt' then
    if coalesce(length(payload->>'fingerprint'),0) <> 64 then raise exception 'Invalid fingerprint'; end if;
    delete from public.shared_login_attempts where started_at < now() - interval '15 minutes';
    insert into public.shared_login_attempts(fingerprint) values(payload->>'fingerprint')
      on conflict(fingerprint) do update set attempts=public.shared_login_attempts.attempts+1
      returning attempts into n;
    return jsonb_build_object('allowed',n <= 10);
  elsif operation = 'get' then
    return jsonb_build_object(
      'household',(select to_jsonb(h) from public.households h where id=hid),
      'members',(select coalesce(jsonb_agg(m order by m.name),'[]') from public.members m where household_id=hid),
      'entries',(select coalesce(jsonb_agg(e order by e.created_at desc),'[]') from public.entries e where household_id=hid)
    );
  elsif operation = 'create' then
    insert into public.entries(household_id,created_by,kind,title,description,category,date,assignee,amount,url)
    values(hid,owner_uid,payload->>'kind',trim(payload->>'title'),coalesce(payload->>'description',''),payload->>'category',
      nullif(payload->>'date','')::date,nullif(payload->>'assignee','')::uuid,nullif(payload->>'amount','')::numeric,coalesce(payload->>'url',''));
  elsif operation = 'update' then
    select * into row_data from public.entries where id=(payload->>'id')::uuid and household_id=hid for update;
    if not found then raise exception 'Entry not found'; end if;
    row_data := jsonb_populate_record(row_data, payload);
    update public.entries set title=row_data.title, description=row_data.description, category=row_data.category,
      date=row_data.date,assignee=row_data.assignee,amount=row_data.amount,url=row_data.url,done=row_data.done
      where id=(payload->>'id')::uuid and household_id=hid;
  elsif operation = 'delete' then
    delete from public.entries where id=(payload->>'id')::uuid and household_id=hid;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Entry not found'; end if;
  elsif operation = 'member' then
    person_id := gen_random_uuid();
    insert into auth.users(id) values(person_id);
    insert into public.members(user_id,household_id,name) values(person_id,hid,trim(payload->>'name'));
  else raise exception 'Unknown operation';
  end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.shared_home(text,text,jsonb) from public, authenticated;
grant execute on function public.shared_home(text,text,jsonb) to anon;
commit;
