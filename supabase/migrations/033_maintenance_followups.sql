begin;
alter table public.house_maintenance add column due_date date;
create table public.house_maintenance_updates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  request_id uuid not null,
  actor uuid not null,
  note text not null check (length(trim(note)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key(household_id,request_id) references public.house_maintenance(household_id,id) on delete cascade,
  foreign key(household_id,actor) references public.members(household_id,user_id)
);
create index house_maintenance_updates_request on public.house_maintenance_updates(household_id,request_id,created_at);
alter table public.house_maintenance_updates enable row level security;
revoke all on public.house_maintenance_updates from public,anon,authenticated;
alter function public.shared_household_life(text,text,jsonb) rename to shared_household_life_before_followups;
revoke all on function public.shared_household_life_before_followups(text,text,jsonb) from public,anon,authenticated;
create function public.shared_household_life(access_token text, operation text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; actor uuid; target uuid; result jsonb; prior public.house_maintenance; updated public.house_maintenance;
begin
  select household_id into hid from public.shared_home_config where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  if operation='get' then
    result:=public.shared_household_life_before_followups(access_token,operation,payload);
    return result||jsonb_build_object('updates',(select coalesce(jsonb_agg(u order by u.created_at,u.id),'[]'::jsonb) from public.house_maintenance_updates u where household_id=hid));
  end if;
  actor:=nullif(payload->>'actor','')::uuid;
  if operation in ('maintenance_save','maintenance_followup') and not exists(select 1 from public.members where household_id=hid and user_id=actor and active and name<>'Housemates') then raise exception 'Sign in as a housemate'; end if;
  if operation='maintenance_followup' then
    target:=(payload->>'id')::uuid;
    if not exists(select 1 from public.house_maintenance where household_id=hid and id=target) then raise exception 'Request not found'; end if;
    insert into public.house_maintenance_updates(household_id,request_id,actor,note) values(hid,target,actor,trim(payload->>'note'));
    return public.shared_household_life(access_token,'get',jsonb_build_object('actor',actor));
  end if;
  if operation='maintenance_save' then
    if payload->>'due_date' is not null and payload->>'due_date'<>'' and ((payload->>'due_date')::date<current_date-365 or (payload->>'due_date')::date>current_date+730) then raise exception 'Choose a due date within two years'; end if;
    target:=nullif(payload->>'id','')::uuid;
    if target is not null then select * into prior from public.house_maintenance where household_id=hid and id=target; end if;
  end if;
  result:=public.shared_household_life_before_followups(access_token,operation,payload);
  if operation='maintenance_save' then
    if target is null then select id into target from public.house_maintenance where household_id=hid and created_by=actor order by created_at desc,id desc limit 1; end if;
    update public.house_maintenance set due_date=nullif(payload->>'due_date','')::date where household_id=hid and id=target returning * into updated;
    if prior.id is null then
      insert into public.house_maintenance_updates(household_id,request_id,actor,note) values(hid,target,actor,'Request opened.');
    elsif (prior.status,prior.assignee,prior.due_date,prior.resolution) is distinct from (updated.status,updated.assignee,updated.due_date,updated.resolution) then
      insert into public.house_maintenance_updates(household_id,request_id,actor,note) values(hid,target,actor,
        concat_ws(' · ',case when prior.status is distinct from updated.status then 'Status: '||replace(updated.status,'_',' ') end,
          case when prior.assignee is distinct from updated.assignee then 'Assignment changed' end,
          case when prior.due_date is distinct from updated.due_date then 'Due date: '||coalesce(updated.due_date::text,'cleared') end,
          case when prior.resolution is distinct from updated.resolution then case when updated.resolution<>'' then updated.resolution else 'Follow-up note cleared' end end));
    end if;
  end if;
  return result||jsonb_build_object(
    'maintenance',(select coalesce(jsonb_agg(r order by r.created_at desc),'[]'::jsonb) from public.house_maintenance r where household_id=hid),
    'updates',(select coalesce(jsonb_agg(u order by u.created_at,u.id),'[]'::jsonb) from public.house_maintenance_updates u where household_id=hid)
  );
end $$;
revoke all on function public.shared_household_life(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_household_life(text,text,jsonb) to anon;
commit;
