-- Integrate the concurrently delivered membership and household-life gateways.
-- Migration 022 was already applied before the coordination change reached main;
-- preserve its contents and run the previously unapplied coordination SQL as 023.
begin;
alter function public.shared_household_life(text,text,jsonb) rename to shared_household_life_before_membership;
revoke all on function public.shared_household_life_before_membership(text,text,jsonb) from public,anon,authenticated;
create function public.shared_household_life(access_token text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  -- Lock membership before authored writes, matching all other shared gateways.
  perform public.coordination_identity(access_token,payload->>'actor');
  return public.shared_household_life_before_membership(access_token,operation,payload);
end $$;
revoke all on function public.shared_household_life(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_household_life(text,text,jsonb) to anon;

alter function public.shared_coordination(text,text,jsonb) rename to shared_coordination_before_life;
revoke all on function public.shared_coordination_before_life(text,text,jsonb) from public,anon,authenticated;
create function public.shared_coordination(access_token text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare hid uuid; departed uuid; result jsonb;
begin
  hid := public.coordination_identity(access_token,case when operation='get' then null else payload->>'actor' end);
  departed := case when operation='leave' then (payload->>'actor')::uuid else nullif(payload->>'member','')::uuid end;
  result := public.shared_coordination_before_life(access_token,operation,payload);
  if operation in ('remove_member','leave') then
    update public.house_maintenance set assignee=null,updated_at=now() where household_id=hid and assignee=departed and status<>'resolved';
    update public.house_meals set cook=null where household_id=hid and cook=departed and date >= (now() at time zone 'America/New_York')::date;
    delete from public.house_poll_votes v using public.house_polls p where v.poll_id=p.id and v.household_id=hid and v.member_id=departed and p.decision is null;
  end if;
  return result;
end $$;
revoke all on function public.shared_coordination(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_coordination(text,text,jsonb) to anon,authenticated;

-- Preserve each installed wrapper and its ACLs while advancing the displayed version.
do $$ declare fn record; definition text; begin
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'shared_household_ops%' and p.prosrc like '%schema_version%'
  loop
    definition:=replace(pg_get_functiondef(fn.oid),$old$'schema_version', '022'$old$,$new$'schema_version', '024'$new$);
    definition:=replace(definition,$old$'schema_version','022'$old$,$new$'schema_version','024'$new$);
    execute definition;
  end loop;
end $$;
commit;
