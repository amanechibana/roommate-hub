-- Completion times belong to actions, never to an entry's creation date.
begin;
create table public.house_activity (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor uuid not null,
  action text not null check (action in ('completed','bought','reopened','paid','noted')),
  title text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index house_activity_recent on public.house_activity(household_id, created_at desc);
alter table public.house_activity enable row level security;
revoke all on public.house_activity from public, anon, authenticated;

-- Keep the existing gateway's validation, atomic bill writes, and undo intact.
alter function public.shared_home(text,text,jsonb) rename to shared_home_before_activity;
revoke all on function public.shared_home_before_activity(text,text,jsonb) from public, anon, authenticated;
create function public.shared_home(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; before_entry public.entries; after_entry public.entries;
  result jsonb; verb text; actor_uid uuid;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  if operation in ('update','payment') then
    -- Serialize concurrent completions so repeated checks produce one event.
    select * into before_entry from public.entries
      where household_id=hid and id=(payload->>'id')::uuid for update;
  end if;
  result := public.shared_home_before_activity(access_token,operation,payload);
  if operation in ('update','payment') and before_entry.id is not null then
    select * into after_entry from public.entries where id=before_entry.id and household_id=hid;
    if before_entry.kind=after_entry.kind and after_entry.kind in ('task','request') and before_entry.done is distinct from after_entry.done then
      verb := case when not after_entry.done then 'reopened' when after_entry.kind='request' then 'bought' else 'completed' end;
    elsif operation='payment' and cardinality(after_entry.paid_by) > cardinality(before_entry.paid_by) then
      verb := 'paid';
    end if;
  elsif operation='create' and payload->>'kind'='note' then
    select * into after_entry from public.entries where id=(result->'entries'->0->>'id')::uuid and household_id=hid;
    if after_entry.id is not null then verb := 'noted'; end if;
  end if;
  if verb is not null then
    -- The inner gateway already checked the actor belongs to this household.
    actor_uid := (payload->>'actor')::uuid;
    insert into public.house_activity(household_id,actor,action,title)
      values(hid,actor_uid,verb,after_entry.title);
  end if;
  if operation not in ('attempt','attempt_clear') then
    result := result || jsonb_build_object('activity', (
      select coalesce(jsonb_agg(to_jsonb(a) - 'household_id' order by a.created_at desc,a.id),'[]'::jsonb)
      from (select * from public.house_activity where household_id=hid order by created_at desc,id limit 20) a
    ));
  end if;
  return result;
end $$;
revoke all on function public.shared_home(text,text,jsonb) from public, authenticated;
grant execute on function public.shared_home(text,text,jsonb) to anon;
commit;
