-- Polls, supplies, repairs, shared dinners and monthly ledger targets.
begin;
create table public.house_polls (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  options jsonb not null check (jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 6),
  deadline timestamptz not null, decision text check (length(trim(decision)) between 1 and 2000),
  decided_by uuid, decided_at timestamptz, created_by uuid not null, created_at timestamptz not null default now(),
  unique(household_id,id),
  foreign key(household_id,created_by) references public.members(household_id,user_id),
  foreign key(household_id,decided_by) references public.members(household_id,user_id),
  check ((decision is null and decided_by is null and decided_at is null) or (decision is not null and decided_by is not null and decided_at is not null))
);
create table public.house_poll_votes (
  household_id uuid not null, poll_id uuid not null, member_id uuid not null, choice integer not null check(choice between 0 and 5),
  updated_at timestamptz not null default now(), primary key(poll_id,member_id),
  foreign key(household_id,poll_id) references public.house_polls(household_id,id) on delete cascade,
  foreign key(household_id,member_id) references public.members(household_id,user_id)
);
create table public.house_pantry (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 160),
  status text not null default 'stocked' check(status in ('stocked','low','out')),
  notes text not null default '' check(length(notes)<=2000), created_by uuid not null,
  updated_at timestamptz not null default now(),
  foreign key(household_id,created_by) references public.members(household_id,user_id)
);
create unique index house_pantry_staple on public.house_pantry(household_id,lower(trim(title)));
create table public.house_maintenance (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 160),
  description text not null default '' check(length(description)<=2000), assignee uuid,
  status text not null default 'open' check(status in ('open','in_progress','resolved')),
  resolution text not null default '' check(length(resolution)<=2000), resolved_at timestamptz,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(household_id,id),
  foreign key(household_id,created_by) references public.members(household_id,user_id),
  foreign key(household_id,assignee) references public.members(household_id,user_id),
  check((status='resolved' and resolved_at is not null and length(trim(resolution))>0) or (status<>'resolved' and resolved_at is null))
);
create table public.house_maintenance_photos (
  id uuid primary key default gen_random_uuid(), household_id uuid not null, request_id uuid not null,
  storage_path text not null unique check(length(storage_path) between 1 and 600),
  file_name text not null check(length(file_name) between 1 and 180),
  content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 10485760), created_by uuid not null, created_at timestamptz not null default now(),
  foreign key(household_id,request_id) references public.house_maintenance(household_id,id) on delete cascade,
  foreign key(household_id,created_by) references public.members(household_id,user_id)
);
create table public.house_meals (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 160), date date not null, cook uuid,
  ingredients jsonb not null default '[]' check(jsonb_typeof(ingredients)='array' and jsonb_array_length(ingredients)<=60),
  notes text not null default '' check(length(notes)<=2000), calendar_entry_id uuid references public.entries(id) on delete set null,
  created_by uuid not null, created_at timestamptz not null default now(),
  foreign key(household_id,created_by) references public.members(household_id,user_id),
  foreign key(household_id,cook) references public.members(household_id,user_id)
);
create table public.house_budget_targets (
  household_id uuid not null references public.households(id) on delete cascade, month date not null check(extract(day from month)=1),
  category text not null check(category in ('groceries','utilities')), target_cents integer not null check(target_cents between 0 and 100000000),
  updated_by uuid not null, primary key(household_id,month,category),
  foreign key(household_id,updated_by) references public.members(household_id,user_id)
);
create table public.house_budget_expenses (
  expense_id uuid primary key references public.household_expenses(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null check(category in ('groceries','utilities')), updated_by uuid not null,
  foreign key(household_id,updated_by) references public.members(household_id,user_id)
);
do $$ declare t text; begin
  foreach t in array array['house_polls','house_poll_votes','house_pantry','house_maintenance','house_maintenance_photos','house_meals','house_budget_targets','house_budget_expenses'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    if t not in ('house_budget_targets') then
      execute format('create index on public.%I(household_id)',t);
    end if;
  end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('house-maintenance','house-maintenance',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function public.shared_household_life(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  hid uuid; actor_uid uuid; eid uuid; assigned uuid; poll public.house_polls; repair public.house_maintenance;
  staple public.house_pantry; meal public.house_meals; photo public.house_maintenance_photos;
  part jsonb; item_title text; result jsonb; entry_id uuid; v_ingredients jsonb;
  state text; note text; paths jsonb := '[]'; added integer := 0;
begin
  select household_id into hid from public.shared_home_config where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  if operation='get' then
    return jsonb_build_object(
      'polls',(select coalesce(jsonb_agg(p order by p.created_at desc),'[]') from public.house_polls p where household_id=hid),
      'votes',(select coalesce(jsonb_agg(v),'[]') from public.house_poll_votes v where household_id=hid),
      'pantry',(select coalesce(jsonb_agg(p order by p.title),'[]') from public.house_pantry p where household_id=hid),
      'maintenance',(select coalesce(jsonb_agg(r order by r.created_at desc),'[]') from public.house_maintenance r where household_id=hid),
      'photos',(select coalesce(jsonb_agg(p order by p.created_at),'[]') from public.house_maintenance_photos p where household_id=hid),
      'meals',(select coalesce(jsonb_agg(m order by m.date,m.created_at),'[]') from public.house_meals m where household_id=hid),
      'targets',(select coalesce(jsonb_agg(t),'[]') from public.house_budget_targets t where household_id=hid),
      'categories',(select coalesce(jsonb_agg(c),'[]') from public.house_budget_expenses c where household_id=hid)
    );
  elsif operation='photo' then
    select * into photo from public.house_maintenance_photos where id=(payload->>'id')::uuid and household_id=hid;
    if not found then raise exception 'Photo not found'; end if;
    return jsonb_build_object('photo',to_jsonb(photo));
  end if;
  actor_uid := nullif(payload->>'actor','')::uuid;
  if not exists(select 1 from public.members where household_id=hid and user_id=actor_uid and name<>'Housemates') then
    raise exception 'Choose a household member' using errcode='42501';
  end if;
  -- Serializes shopping deduplication and votes/decisions for this household.
  perform pg_advisory_xact_lock(hashtextextended(hid::text,22));
  eid := nullif(payload->>'id','')::uuid;
  if operation='poll_create' then
    if (payload->>'deadline')::timestamptz <= clock_timestamp() then raise exception 'Choose a future deadline'; end if;
    if jsonb_typeof(payload->'options') is distinct from 'array' then raise exception 'Choose 2 to 6 options'; end if;
    for part in select value from jsonb_array_elements(payload->'options') loop
      if jsonb_typeof(part)<>'string' or length(trim(part#>>'{}')) not between 1 and 120 then raise exception 'Options must be between 1 and 120 characters'; end if;
    end loop;
    if (select count(distinct lower(trim(value#>>'{}'))) from jsonb_array_elements(payload->'options')) <> jsonb_array_length(payload->'options') then raise exception 'Use distinct options'; end if;
    insert into public.house_polls(household_id,title,options,deadline,created_by)
      values(hid,trim(payload->>'title'),payload->'options',(payload->>'deadline')::timestamptz,actor_uid);
  elsif operation in ('poll_vote','poll_decide') then
    select * into poll from public.house_polls where id=eid and household_id=hid for update;
    if not found then raise exception 'Poll not found'; end if;
    if poll.decision is not null then raise exception 'This decision is already saved'; end if;
    if operation='poll_vote' then
      if poll.deadline<=clock_timestamp() then raise exception 'Voting has ended'; end if;
      if jsonb_typeof(payload->'choice') is distinct from 'number' or (payload->>'choice') !~ '^[0-9]+$' or (payload->>'choice')::integer >= jsonb_array_length(poll.options) then raise exception 'Choose a valid option'; end if;
      insert into public.house_poll_votes(household_id,poll_id,member_id,choice) values(hid,eid,actor_uid,(payload->>'choice')::integer)
      on conflict(poll_id,member_id) do update set choice=excluded.choice,updated_at=now();
    else
      if poll.deadline>clock_timestamp() then raise exception 'Wait until the deadline to save the decision'; end if;
      update public.house_polls set decision=trim(payload->>'decision'),decided_by=actor_uid,decided_at=now() where id=eid;
    end if;
  elsif operation='pantry_save' then
    if eid is null then
      insert into public.house_pantry(household_id,title,status,notes,created_by) values(hid,trim(payload->>'title'),payload->>'status',coalesce(payload->>'notes',''),actor_uid);
    else
      update public.house_pantry set title=trim(payload->>'title'),status=payload->>'status',notes=coalesce(payload->>'notes',''),updated_at=now() where id=eid and household_id=hid;
      if not found then raise exception 'Staple not found'; end if;
    end if;
  elsif operation='pantry_delete' then
    delete from public.house_pantry where id=eid and household_id=hid;
    if not found then raise exception 'Staple not found'; end if;
  elsif operation='maintenance_save' then
    assigned := nullif(payload->>'assignee','')::uuid;
    if assigned is not null and not exists(select 1 from public.members where household_id=hid and user_id=assigned and name<>'Housemates') then raise exception 'Choose a valid housemate'; end if;
    state := coalesce(payload->>'status','open'); note := coalesce(payload->>'resolution','');
    if state='resolved' and length(trim(note))=0 then raise exception 'Record how it was resolved'; end if;
    if eid is null then
      insert into public.house_maintenance(household_id,title,description,assignee,status,resolution,resolved_at,created_by)
      values(hid,trim(payload->>'title'),coalesce(payload->>'description',''),assigned,state,note,case when state='resolved' then now() end,actor_uid);
    else
      update public.house_maintenance set title=trim(payload->>'title'),description=coalesce(payload->>'description',''),assignee=assigned,status=state,resolution=note,
        resolved_at=case when state='resolved' then coalesce(resolved_at,now()) end,updated_at=now() where id=eid and household_id=hid;
      if not found then raise exception 'Request not found'; end if;
    end if;
  elsif operation='maintenance_delete' then
    select coalesce(jsonb_agg(storage_path),'[]') into paths from public.house_maintenance_photos where request_id=eid and household_id=hid;
    delete from public.house_maintenance where id=eid and household_id=hid;
    if not found then raise exception 'Request not found'; end if;
  elsif operation='photo_attach' then
    select * into repair from public.house_maintenance where id=(payload->>'request_id')::uuid and household_id=hid;
    if not found then raise exception 'Request not found'; end if;
    if (select count(*) from public.house_maintenance_photos where request_id=repair.id)>=20 then raise exception 'This request already has 20 photos'; end if;
    if (payload->>'storage_path') not like hid::text || '/' || repair.id::text || '/%' then raise exception 'Invalid photo path'; end if;
    insert into public.house_maintenance_photos(household_id,request_id,storage_path,file_name,content_type,size_bytes,created_by)
    values(hid,repair.id,payload->>'storage_path',payload->>'file_name',payload->>'content_type',(payload->>'size_bytes')::integer,actor_uid)
    returning * into photo;
  elsif operation='photo_delete' then
    delete from public.house_maintenance_photos where id=eid and household_id=hid returning * into photo;
    if not found then raise exception 'Photo not found'; end if;
    paths := jsonb_build_array(photo.storage_path);
  elsif operation='meal_save' then
    assigned := nullif(payload->>'cook','')::uuid;
    if assigned is not null and not exists(select 1 from public.members where household_id=hid and user_id=assigned and name<>'Housemates') then raise exception 'Choose a valid cook'; end if;
    v_ingredients := coalesce(payload->'ingredients','[]');
    if jsonb_typeof(v_ingredients) is distinct from 'array' then raise exception 'Use an ingredient list'; end if;
    for part in select value from jsonb_array_elements(v_ingredients) loop
      if jsonb_typeof(part) is distinct from 'object' or jsonb_typeof(part->'title') is distinct from 'string' or length(trim(part->>'title')) not between 1 and 160 or jsonb_typeof(part->'missing') is distinct from 'boolean' then raise exception 'Invalid ingredient'; end if;
    end loop;
    if eid is null then
      result := public.shared_home(access_token,'create',jsonb_build_object('actor',actor_uid,'kind','event','title',trim(payload->>'title'),'category','Together','description',coalesce(payload->>'notes',''),'date',payload->>'date','assignee',assigned));
      entry_id := (result->'entries'->0->>'id')::uuid;
      if entry_id is null then raise exception 'Could not put dinner on the calendar'; end if;
      insert into public.house_meals(household_id,title,date,cook,ingredients,notes,calendar_entry_id,created_by)
      values(hid,trim(payload->>'title'),(payload->>'date')::date,assigned,v_ingredients,coalesce(payload->>'notes',''),entry_id,actor_uid);
    else
      select * into meal from public.house_meals where id=eid and household_id=hid for update;
      if not found then raise exception 'Meal not found'; end if;
      if meal.calendar_entry_id is not null then
        perform public.shared_home(access_token,'update',jsonb_build_object('actor',actor_uid,'id',meal.calendar_entry_id,'title',trim(payload->>'title'),'date',payload->>'date','description',coalesce(payload->>'notes',''),'assignee',assigned));
      end if;
      update public.house_meals set title=trim(payload->>'title'),date=(payload->>'date')::date,cook=assigned,ingredients=v_ingredients,notes=coalesce(payload->>'notes','') where id=eid;
    end if;
  elsif operation='meal_delete' then
    delete from public.house_meals where id=eid and household_id=hid returning * into meal;
    if not found then raise exception 'Meal not found'; end if;
    if meal.calendar_entry_id is not null then perform public.shared_home(access_token,'delete',jsonb_build_object('actor',actor_uid,'id',meal.calendar_entry_id)); end if;
  elsif operation in ('pantry_shop','meal_shop') then
    if operation='pantry_shop' then
      select * into staple from public.house_pantry where id=eid and household_id=hid;
      if not found then raise exception 'Staple not found'; end if;
      v_ingredients := jsonb_build_array(jsonb_build_object('title',staple.title,'missing',true));
    else
      select * into meal from public.house_meals where id=eid and household_id=hid;
      if not found then raise exception 'Meal not found'; end if;
      v_ingredients := meal.ingredients;
    end if;
    for part in select value from jsonb_array_elements(v_ingredients) loop
      if (part->>'missing')::boolean then
        item_title := trim(part->>'title');
        if not exists(select 1 from public.entries where household_id=hid and kind='request' and not done and category<>'Personal' and lower(trim(title))=lower(item_title)) then
          perform public.shared_home(access_token,'create',jsonb_build_object('actor',actor_uid,'kind','request','title',item_title,'category','Need','description',case when operation='meal_shop' then 'For ' || meal.title || ' on ' || meal.date::text else staple.notes end));
          added := added+1;
        end if;
      end if;
    end loop;
  elsif operation='budget_target' then
    if jsonb_typeof(payload->'target_cents') is distinct from 'number' or (payload->>'target_cents') !~ '^[0-9]+$' then raise exception 'Use whole cents'; end if;
    insert into public.house_budget_targets(household_id,month,category,target_cents,updated_by)
    values(hid,(payload->>'month')::date,payload->>'category',(payload->>'target_cents')::integer,actor_uid)
    on conflict(household_id,month,category) do update set target_cents=excluded.target_cents,updated_by=actor_uid;
  elsif operation='budget_category' then
    if not exists(select 1 from public.household_expenses where id=eid and household_id=hid and kind='expense') then raise exception 'Purchase not found'; end if;
    if nullif(payload->>'category','') is null then delete from public.house_budget_expenses where expense_id=eid and household_id=hid;
    else
      insert into public.house_budget_expenses(expense_id,household_id,category,updated_by) values(eid,hid,payload->>'category',actor_uid)
      on conflict(expense_id) do update set category=excluded.category,updated_by=actor_uid;
    end if;
  else raise exception 'Unknown operation'; end if;
  return public.shared_household_life(access_token,'get','{}') || jsonb_build_object('paths',paths,'added',added);
end $$;
revoke all on function public.shared_household_life(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_household_life(text,text,jsonb) to anon;
-- Keep the existing reliability panel's displayed schema version accurate.
alter function public.shared_household_ops(text,text,jsonb) rename to shared_household_ops_v021;
revoke all on function public.shared_household_ops_v021(text,text,jsonb) from public,anon,authenticated;
create function public.shared_household_ops(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result := public.shared_household_ops_v021(access_token,operation,payload);
  if operation='status' then result := result || jsonb_build_object('schema_version','022'); end if;
  return result;
end $$;
revoke all on function public.shared_household_ops(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_household_ops(text,text,jsonb) to anon;
commit;
