begin;
alter table public.members add column active boolean not null default true;
-- Existing member predicates now exclude former members from new obligations.
-- Keep the installed implementations and their ACLs rather than copying old bodies.
do $predicates$
declare fn record; definition text;
begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'shared_%' and p.proname not like 'shared_expenses%' and p.prosrc like '%public.members%'
 loop
 definition:=pg_get_functiondef(fn.oid);
 definition:=regexp_replace(definition,'([a-z_]+\.)?name[[:space:]]*<>[[:space:]]*''Housemates''',
 '\1name <> ''Housemates'' and \1active','g');
 definition:=replace(definition,$old$'schema_version','021'$old$,$new$'schema_version','022'$new$);
 execute definition;
 end loop;
end $predicates$;
-- Assign the legacy shared-screen owner to the first named housemate.
update public.households h set owner_id=(select user_id from public.members m where m.household_id=h.id and m.name<>'Housemates' order by m.name,user_id limit 1)
where exists(select 1 from public.members m where m.user_id=h.owner_id and m.name='Housemates')
and exists(select 1 from public.members m where m.household_id=h.id and m.name<>'Housemates');
create table public.house_membership_agreement_archive (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id),
 departed_member uuid not null references public.members(user_id), agreement jsonb not null, archived_at timestamptz not null default now()
);
alter table public.house_membership_agreement_archive enable row level security;
revoke all on public.house_membership_agreement_archive from public,anon,authenticated;
create table public.house_resources (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id),
 name text not null check(length(trim(name)) between 1 and 80), unique(household_id,name)
);
create table public.house_bookings (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id),
 resource_id uuid not null references public.house_resources(id), member uuid not null references public.members(user_id),
 starts_at timestamptz not null, ends_at timestamptz not null, notes text not null default '' check(length(notes)<=1000),
 canceled boolean not null default false, check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours')
);
create index house_bookings_resource on public.house_bookings(resource_id,starts_at) where not canceled;
create table public.house_checkins (
 household_id uuid not null references public.households(id), week date not null,
 notes text not null default '' check(length(notes)<=2000), reviewed_by uuid not null references public.members(user_id), reviewed_at timestamptz not null default now(),
 primary key(household_id,week), check(extract(isodow from week)=1)
);
create table public.house_decisions (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id),
 title text not null check(length(trim(title)) between 1 and 160), done boolean not null default false,
 created_by uuid not null references public.members(user_id), created_at timestamptz not null default now()
);
create table public.house_moves (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id),
 member uuid not null references public.members(user_id), direction text not null check(direction in ('in','out')), date date not null,
 items jsonb not null, created_by uuid not null references public.members(user_id), created_at timestamptz not null default now()
);
alter table public.house_resources enable row level security;
revoke all on public.house_resources from public,anon,authenticated;
alter table public.house_bookings enable row level security;
revoke all on public.house_bookings from public,anon,authenticated;
alter table public.house_checkins enable row level security;
revoke all on public.house_checkins from public,anon,authenticated;
alter table public.house_decisions enable row level security;
revoke all on public.house_decisions from public,anon,authenticated;
alter table public.house_moves enable row level security;
revoke all on public.house_moves from public,anon,authenticated;
insert into public.house_resources(household_id,name) select household_id,n from public.shared_home_config cross join unnest(array['Laundry','Parking spot','Shared workspace']) n;
create function public.coordination_identity(access_token text,actor text) returns uuid language plpgsql security definer set search_path='' as $$
declare hid uuid;
begin
 select household_id into hid from public.shared_home_config where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
 if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
 -- Serialize authored changes with membership updates so removal cannot race a write.
 if actor is not null then perform 1 from public.households where id=hid for update; end if;
 if actor is not null and not exists(select 1 from public.members where household_id=hid and user_id=actor::uuid and active and name<>'Housemates') then raise exception 'Choose a current household member.'; end if;
 return hid;
end $$;
revoke all on function public.coordination_identity(text,text) from public,anon,authenticated;
-- Guard archived actors across every gateway, preserving the existing bodies.
do $wrap$
declare gateway text; previous text;
begin
 foreach gateway in array array['shared_home','shared_expenses','shared_agreements','shared_handbook','shared_push','shared_household_ops'] loop
 previous:=gateway||'_before_membership';
 execute format('alter function public.%I(text,text,jsonb) rename to %I',gateway,previous);
 execute format('revoke all on function public.%I(text,text,jsonb) from public,anon,authenticated',previous);
 execute format($body$create function public.%I(access_token text,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $fn$
 declare hid uuid; result jsonb;
 begin
 hid:=public.coordination_identity(access_token,payload->>'actor');
 if operation='subscribe' then perform public.coordination_identity(access_token,payload->>'member'); end if;
 if operation='member' and %L='shared_home' then return public.shared_coordination(access_token,'invite',payload); end if;
 result:=public.%I(access_token,operation,payload);
 if operation='get' and result ? 'members' then
 result:=result||jsonb_build_object('former_members',coalesce((select jsonb_agg(m) from jsonb_array_elements(result->'members') m where not coalesce((m->>'active')::boolean,true)),'[]'));
 result:=jsonb_set(result,'{members}',coalesce((select jsonb_agg(m) from jsonb_array_elements(result->'members') m where coalesce((m->>'active')::boolean,true)),'[]')); end if;
 return result;
 end $fn$;$body$,gateway,gateway,previous);
 execute format('revoke all on function public.%I(text,text,jsonb) from public,anon,authenticated',gateway);
 execute format('grant execute on function public.%I(text,text,jsonb) to anon,authenticated',gateway);
 end loop;
end $wrap$;
create function public.shared_coordination(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; current_actor uuid; target uuid; owner uuid; rid uuid; start_time timestamptz; end_time timestamptz;
 move public.house_moves; idx integer; today date:=(now() at time zone 'America/New_York')::date; current_week date;
begin
 hid:=public.coordination_identity(access_token,case when operation='get' then null else payload->>'actor' end);
 current_week:=date_trunc('week',today)::date;
 if operation='get' then
 return jsonb_build_object(
 'resources',(select coalesce(jsonb_agg(r order by name),'[]') from public.house_resources r where household_id=hid),
 'bookings',(select coalesce(jsonb_agg(b order by starts_at),'[]') from public.house_bookings b where household_id=hid and not canceled and ends_at>now()-interval '7 days' and starts_at<now()+interval '190 days'),
 'checkin',(select to_jsonb(c) from public.house_checkins c where household_id=hid and c.week=current_week), 'week',current_week,
 'decisions',(select coalesce(jsonb_agg(d order by created_at),'[]') from public.house_decisions d where household_id=hid and not done),
 'moves',(select coalesce(jsonb_agg(m order by date),'[]') from public.house_moves m where household_id=hid),
 'bills',(select coalesce(jsonb_agg(e order by date),'[]') from public.entries e where household_id=hid and kind='event' and category in ('Bill','Rent') and date<=current_week+13 and cardinality(payment_members)>0 and not payment_members<@paid_by),
 'chores',(select coalesce(jsonb_agg(e order by date nulls last),'[]') from public.entries e where household_id=hid and kind='task' and category<>'Personal' and not done and (date is null or date<=current_week+13)),
 'pending_agreements',(select coalesce(jsonb_agg(p),'[]') from (
 select id,title from public.agreements where household_id=hid and status='proposed'
 union all select id,title from public.agreement_amendments where household_id=hid and status='open'
 union all select id,'Agreement relief request' as title from public.agreement_events where household_id=hid and status='open') p),
 'agreement_archive',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'departed_member',departed_member,'agreement',agreement,'archived_at',archived_at) order by archived_at desc),'[]') from public.house_membership_agreement_archive where household_id=hid),
 'checkin_history',(select coalesce(jsonb_agg(c order by week desc),'[]') from (select week,notes,reviewed_by,reviewed_at from public.house_checkins where household_id=hid and week<date_trunc('week',today)::date order by week desc limit 12) c),
 'former_members',(select coalesce(jsonb_agg(m order by name),'[]') from public.members m where household_id=hid and not active)
 );
 end if;
 current_actor:=nullif(payload->>'actor','')::uuid;
 if current_actor is null then raise exception 'Choose a current household member.'; end if;
 if operation in ('invite','remove_member','leave','transfer_owner') then
 perform 1 from public.households where id=hid for update;
 select owner_id into owner from public.households where id=hid;
 if operation<>'leave' and current_actor<>owner then raise exception 'Only the owner can manage membership.'; end if;
 if operation='invite' then
 if (select count(*) from public.members where household_id=hid and active and name<>'Housemates')>=2 then raise exception 'This household currently supports two people. Remove a departing housemate before inviting a replacement.'; end if;
 if length(trim(coalesce(payload->>'name',''))) not between 1 and 50 or lower(trim(payload->>'name'))='housemates' then raise exception 'Enter a housemate name of 1–50 characters.'; end if;
 if exists(select 1 from public.members where household_id=hid and active and lower(name)=lower(trim(payload->>'name'))) then raise exception 'A housemate already uses that name.'; end if;
 target:=gen_random_uuid();
 insert into auth.users(id) values(target);
 insert into public.members(user_id,household_id,name) values(target,hid,trim(payload->>'name'));
 return jsonb_build_object('member_id',target);
 end if;
 target:=case when operation='leave' then current_actor else nullif(payload->>'member','')::uuid end;
 if not exists(select 1 from public.members where household_id=hid and user_id=target and active and name<>'Housemates') then raise exception 'Choose a current housemate.'; end if;
 if operation='transfer_owner' then
 update public.households set owner_id=target where id=hid;
 return jsonb_build_object('ok',true);
 end if;
 if target=owner then raise exception 'Transfer ownership before leaving or removing the owner.'; end if;
 -- Keep balances and original bill shares addressable after departure.
 insert into public.house_membership_agreement_archive(household_id,departed_member,agreement)
 select hid,target,to_jsonb(a) from public.agreements a where household_id=hid and status<>'draft';
 -- Future generated obligations are canceled; past completions and logs remain.
 delete from public.entries e where e.household_id=hid and e.date>today and not e.done
 and e.series_id in (select series_id from public.agreement_schedule_state where household_id=hid);
 delete from public.agreement_schedule_state where household_id=hid;
 update public.agreement_amendments set status='withdrawn' where household_id=hid and status='open';
 update public.agreement_events set status='declined',decided_by=current_actor,decided_at=now() where household_id=hid and status='open';
 update public.agreements set status='draft',signed_by='{}',proposed_by=null,proposed_at=null,
 terms=(terms-'chore_series_ids'-'gym_series_id') || case when slug='house' then jsonb_build_object('first_bundle_a',owner) else '{}'::jsonb end,
 updated_at=now() where household_id=hid;
 update public.members set active=false where household_id=hid and user_id=target;
 update public.entries set assignee=null where household_id=hid and assignee=target and not done and category<>'Personal';
 update public.house_bookings set canceled=true where household_id=hid and member=target and starts_at>now();
 delete from public.push_subscriptions where household_id=hid and member=target;
 return jsonb_build_object('ok',true);
 elsif operation='resource' then
 insert into public.house_resources(household_id,name) values(hid,trim(payload->>'name'));
 elsif operation='book' then
 rid:=nullif(payload->>'resource_id','')::uuid;
 -- Serialize reservations for a resource, including requests from different devices.
 perform 1 from public.house_resources where id=rid and household_id=hid for update;
 if not found then raise exception 'Choose a resource from this household.'; end if;
 start_time:=(payload->>'starts_at')::timestamptz; end_time:=(payload->>'ends_at')::timestamptz;
 if start_time is null or end_time is null or start_time<now() or start_time>now()+interval '180 days' or end_time<=start_time or end_time>start_time+interval '24 hours' then raise exception 'Choose a future booking within 180 days, lasting at most 24 hours.'; end if;
 if exists(select 1 from public.house_bookings where resource_id=rid and not canceled and starts_at<end_time and ends_at>start_time) then raise exception 'That resource is already booked during this time.'; end if;
 insert into public.house_bookings(household_id,resource_id,member,starts_at,ends_at,notes) values(hid,rid,current_actor,start_time,end_time,coalesce(payload->>'notes',''));
 elsif operation='cancel_booking' then
 update public.house_bookings set canceled=true where id=(payload->>'id')::uuid and household_id=hid and member=current_actor;
 if not found then raise exception 'You can cancel only your own bookings.'; end if;
 elsif operation='checkin' then
 insert into public.house_checkins(household_id,week,notes,reviewed_by) values(hid,current_week,coalesce(payload->>'notes',''),current_actor)
 on conflict(household_id,week) do update set notes=excluded.notes,reviewed_by=current_actor,reviewed_at=now();
 elsif operation='decision' then
 insert into public.house_decisions(household_id,title,created_by) values(hid,trim(payload->>'title'),current_actor);
 elsif operation='resolve_decision' then
 update public.house_decisions set done=true where household_id=hid and id=(payload->>'id')::uuid;
 if not found then raise exception 'Decision not found.'; end if;
 elsif operation='move' then
 target:=nullif(payload->>'member','')::uuid;
 if not exists(select 1 from public.members where household_id=hid and user_id=target and name<>'Housemates') then raise exception 'Choose a housemate.'; end if;
 insert into public.house_moves(household_id,member,direction,date,created_by,items) values(hid,target,payload->>'direction',(payload->>'date')::date,current_actor,
 '[{"title":"Keys and access","done":false,"notes":""},{"title":"Deposit","done":false,"notes":""},{"title":"Meter readings","done":false,"notes":""},{"title":"Cleaning","done":false,"notes":""},{"title":"Final balances","done":false,"notes":""}]');
 elsif operation='move_item' then
 select * into move from public.house_moves where household_id=hid and id=(payload->>'id')::uuid for update;
 idx:=(payload->>'index')::integer;
 if move.id is null or idx is null or idx<0 or idx>=jsonb_array_length(move.items) or length(coalesce(payload->>'notes',''))>1000 or jsonb_typeof(payload->'done')<>'boolean' or not payload ? 'done' then raise exception 'Invalid checklist item.'; end if;
 update public.house_moves set items=jsonb_set(items,array[idx::text],(items->idx)||jsonb_build_object('done',payload->'done','notes',coalesce(payload->>'notes',''))) where id=move.id;
 else raise exception 'Unknown house planning action.';
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.shared_coordination(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_coordination(text,text,jsonb) to anon,authenticated;
commit;
