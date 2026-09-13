-- In-app roommate agreements: the signed documents (house chores and gym),
-- amendments, relief events, generated gym sessions and chore rotations, and
-- per-member workout logs. Everything runs in one transaction so a failed
-- statement rolls the whole file back and a retry starts from nothing instead
-- of half-created tables; that is all the idempotency a run-once prod
-- migration needs, and none of it is conditional for exactly that reason.
begin;

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  slug text not null check (slug in ('house','gym')),
  title text not null check (char_length(title) <= 120),
  status text not null default 'draft' check (status in ('draft','proposed','active')),
  terms jsonb not null default '{}'::jsonb check (jsonb_typeof(terms) = 'object' and pg_column_size(terms) < 32768),
  signed_by uuid[] not null default '{}',
  proposed_by uuid references public.members(user_id),
  proposed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, slug)
);
create table public.agreement_amendments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  title text not null check (char_length(title) <= 160),
  body text not null check (char_length(body) <= 4000),
  terms_patch jsonb check (terms_patch is null or (jsonb_typeof(terms_patch) = 'object' and pg_column_size(terms_patch) < 16384)),
  status text not null default 'open' check (status in ('open','approved','declined','withdrawn')),
  proposed_by uuid not null,
  decided_by uuid,
  reason text check (char_length(reason) <= 1000),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.agreement_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  entry_id uuid references public.entries(id) on delete set null,
  kind text not null check (kind in ('skip_rollover','skip_cover','swap','reschedule','pto','sick','cover_repaid')),
  status text not null check (status in ('open','accepted','declined','done')),
  actor uuid not null,
  hours numeric(4,2) check (hours > 0 and hours <= 24),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 8192),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.gym_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  member uuid not null,
  day_type text not null check (day_type in ('Push','Pull','Legs')),
  weights_minutes int not null check (weights_minutes between 0 and 120),
  cardio_minutes int not null check (cardio_minutes between 0 and 120),
  exercises jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array' and pg_column_size(exercises) < 16384),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, member)
);
create index agreement_amendments_recent on public.agreement_amendments(household_id, created_at desc);
create index agreement_events_recent on public.agreement_events(household_id, created_at desc);
create index gym_logs_household_idx on public.gym_logs(household_id);
alter table public.agreements enable row level security;
alter table public.agreement_amendments enable row level security;
alter table public.agreement_events enable row level security;
alter table public.gym_logs enable row level security;
revoke all on public.agreements, public.agreement_amendments, public.agreement_events, public.gym_logs
  from public, anon, authenticated;

-- Gym sessions live on the calendar as timed events.
alter table public.entries add column time_of_day text check (time_of_day is null or time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.entries drop constraint entries_category_check;
alter table public.entries add constraint entries_category_check
  check (category in ('Chore','To-do','Together','Rent','Bill','Other','Need','Want','Note','Pinned','Personal')
    or (kind = 'event' and category = 'Gym'));

-- 012 renamed the validated gateway to shared_home_before_activity and put the
-- activity wrapper in front; the wrapper is untouched here. The body's 'get'
-- aggregates whole entry rows, so time_of_day flows through automatically —
-- it is re-created verbatim from 009 so the current definition sits beside
-- the schema it now serves.
create or replace function public.shared_home_before_activity(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; owner_uid uuid; row_data public.entries; affected integer; n integer; person_id uuid;
  step interval; until_date date; occurrence date; sid uuid; actor_uid uuid; created_rows jsonb := '[]'::jsonb;
  rotation uuid[] := '{}'; payers uuid[] := '{}'; partner uuid; token uuid; deleted_rows jsonb; was_bill boolean; now_bill boolean;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash = encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode = '42501'; end if;
  select owner_id into owner_uid from public.households where id=hid;
  if operation not in ('attempt', 'attempt_clear', 'get') then
    actor_uid := nullif(payload->>'actor','')::uuid;
    if not exists(select 1 from public.members where household_id=hid and user_id=actor_uid and name <> 'Housemates') then
      raise exception 'Choose a household member' using errcode = '42501';
    end if;
  end if;
  delete from public.deleted_entry_batches where expires_at <= now();
  if operation = 'attempt' then
    if coalesce(length(payload->>'fingerprint'),0) <> 64 then raise exception 'Invalid fingerprint'; end if;
    delete from public.shared_login_attempts where started_at < now() - interval '15 minutes';
    insert into public.shared_login_attempts(fingerprint) values(payload->>'fingerprint')
      on conflict(fingerprint) do update set attempts=public.shared_login_attempts.attempts+1
      returning attempts into n;
    return jsonb_build_object('allowed',n <= 10);
  elsif operation = 'attempt_clear' then
    -- Roommates share a NAT IP; successful sign-ins must not count toward the lockout.
    if coalesce(length(payload->>'fingerprint'),0) <> 64 then raise exception 'Invalid fingerprint'; end if;
    delete from public.shared_login_attempts where fingerprint=payload->>'fingerprint';
    return jsonb_build_object('ok',true);
  elsif operation = 'get' then
    return jsonb_build_object(
      'household',(select to_jsonb(h) from public.households h where id=hid),
      'members',(select coalesce(jsonb_agg(m order by m.name),'[]') from public.members m where household_id=hid),
      'entries',(select coalesce(jsonb_agg(e order by e.created_at desc),'[]') from public.entries e where household_id=hid)
    );
  elsif operation = 'create' then
    occurrence := nullif(payload->>'date','')::date;
    step := case payload->>'repeat' when 'weekly' then interval '7 days'
      when 'biweekly' then interval '14 days' when 'monthly' then interval '1 month' end;
    if payload->>'repeat' is not null and step is null then raise exception 'Unknown repeat'; end if;
    partner := nullif(payload->>'rotation_partner','')::uuid;
    if partner is not null then
      if payload->>'kind' <> 'task' or step is null or occurrence is null
        or nullif(payload->>'assignee','') is null or partner=(payload->>'assignee')::uuid
        or not exists(select 1 from public.members where household_id=hid and user_id=partner and name <> 'Housemates')
        or not exists(select 1 from public.members where household_id=hid and user_id=(payload->>'assignee')::uuid and name <> 'Housemates') then
        raise exception 'Choose two different housemates for a recurring chore';
      end if;
      rotation := array[(payload->>'assignee')::uuid,partner];
    end if;
    if payload->>'kind'='event' and payload->>'category' in ('Rent','Bill') then
      payers := array(select user_id from public.members where household_id=hid and name <> 'Housemates' order by name,user_id);
    end if;
    if step is null or occurrence is null then
      insert into public.entries(household_id,created_by,kind,title,description,category,date,assignee,amount,url,payment_members)
      values(hid,actor_uid,payload->>'kind',trim(payload->>'title'),coalesce(payload->>'description',''),payload->>'category',
        occurrence,nullif(payload->>'assignee','')::uuid,nullif(payload->>'amount','')::numeric,coalesce(payload->>'url',''),payers) returning * into row_data;
      created_rows := created_rows || jsonb_build_array(to_jsonb(row_data));
    else
      until_date := nullif(payload->>'repeat_until','')::date;
      if until_date is null or until_date < occurrence or until_date > occurrence + interval '2 years' then
        raise exception 'Pick a repeat end date within two years.';
      end if;
      sid := gen_random_uuid(); n := 0;
      while occurrence <= until_date loop
        insert into public.entries(household_id,created_by,kind,title,description,category,date,assignee,amount,url,series_id,rotation_members,payment_members)
        values(hid,actor_uid,payload->>'kind',trim(payload->>'title'),coalesce(payload->>'description',''),payload->>'category',
          occurrence,case when cardinality(rotation)>0 then rotation[(n % cardinality(rotation))+1] else nullif(payload->>'assignee','')::uuid end,nullif(payload->>'amount','')::numeric,coalesce(payload->>'url',''),sid,rotation,payers) returning * into row_data;
        created_rows := created_rows || jsonb_build_array(to_jsonb(row_data));
        n := n + 1;
        occurrence := (nullif(payload->>'date','')::date + step * n)::date;
      end loop;
    end if;
  elsif operation = 'update' then
    select * into row_data from public.entries where id=(payload->>'id')::uuid and household_id=hid for update;
    if not found then raise exception 'Entry not found'; end if;
    was_bill := row_data.kind='event' and row_data.category in ('Rent','Bill');
    row_data := jsonb_populate_record(row_data, payload);
    now_bill := row_data.kind='event' and row_data.category in ('Rent','Bill');
    -- Entering or leaving bill status manages payments; leaving must not discard paid records.
    if was_bill and not now_bill then
      if exists(
        select 1 from public.entries e where household_id=hid and cardinality(e.paid_by)>0 and
          (e.id=row_data.id or (payload->>'scope'='series' and e.series_id=row_data.series_id))
      ) then raise exception 'Clear paid checks before changing this bill to another category'; end if;
      update public.entries e set payment_members='{}'::uuid[]
        where household_id=hid and (e.id=row_data.id or (payload->>'scope'='series' and e.series_id=row_data.series_id));
    elsif now_bill and not was_bill then
      payers := array(select user_id from public.members where household_id=hid and name <> 'Housemates' order by name,user_id);
      update public.entries e set payment_members=case when cardinality(e.payment_members)>0 then e.payment_members else payers end
        where household_id=hid and (e.id=row_data.id or (payload->>'scope'='series' and e.series_id=row_data.series_id));
    end if;
    if payload->>'scope' = 'series' and row_data.series_id is not null then
      -- Shared fields change everywhere; date and done stay per-occurrence.
      update public.entries set kind=row_data.kind, title=row_data.title, description=row_data.description, category=row_data.category,
        assignee=case when cardinality(rotation_members)>0 then assignee else row_data.assignee end, amount=row_data.amount, url=row_data.url
        where series_id=row_data.series_id and household_id=hid;
      update public.entries set date=row_data.date, done=row_data.done
        where id=(payload->>'id')::uuid and household_id=hid;
    else
      update public.entries set kind=row_data.kind, title=row_data.title, description=row_data.description, category=row_data.category,
        date=row_data.date,assignee=row_data.assignee,amount=row_data.amount,url=row_data.url,done=row_data.done
        where id=(payload->>'id')::uuid and household_id=hid;
    end if;
  elsif operation = 'payment' then
    select * into row_data from public.entries where id=(payload->>'id')::uuid and household_id=hid for update;
    if not found or row_data.kind <> 'event' or row_data.category not in ('Rent','Bill') or not (actor_uid=any(row_data.payment_members)) then
      raise exception 'This bill is not assigned to you';
    end if;
    if jsonb_typeof(payload->'cover')='boolean' and (payload->>'cover')::boolean then
      update public.entries set paid_by=payment_members where id=row_data.id;
      -- The ledger entry rides the same transaction: shared_expenses re-validates
      -- everything and is idempotent on id, and a raise there rolls back the
      -- payment too, so cover-plus-expense is all or nothing.
      if jsonb_typeof(payload->'expense')='object' then
        perform public.shared_expenses(access_token,'create',(payload->'expense') || jsonb_build_object('actor',payload->>'actor'));
      end if;
    else
      if jsonb_typeof(payload->'paid') is distinct from 'boolean' then raise exception 'Choose paid or unpaid'; end if;
      update public.entries set paid_by=case when (payload->>'paid')::boolean then
        case when actor_uid=any(paid_by) then paid_by else array_append(paid_by,actor_uid) end
        else array_remove(paid_by,actor_uid) end where id=row_data.id;
    end if;
  elsif operation = 'delete' then
    token := coalesce(nullif(payload->>'undo_token','')::uuid,gen_random_uuid());
    with removed as (
      delete from public.entries where household_id=hid and
        case when payload->>'scope'='series' then series_id is not null and series_id=
          (select series_id from public.entries where id=(payload->>'id')::uuid and household_id=hid)
        else id=(payload->>'id')::uuid end returning *
    ) select jsonb_agg(to_jsonb(removed) order by date,id) into deleted_rows from removed;
    if deleted_rows is null then raise exception 'Entry not found'; end if;
    insert into public.deleted_entry_batches(id,household_id,deleted_by,entries) values(token,hid,actor_uid,deleted_rows);
  elsif operation = 'restore' then
    delete from public.deleted_entry_batches where id=(payload->>'undo_token')::uuid
      and household_id=hid and deleted_by=actor_uid and expires_at>now() returning entries into deleted_rows;
    if not found then raise exception 'Undo is no longer available'; end if;
    insert into public.entries select * from jsonb_populate_recordset(null::public.entries,deleted_rows);
    created_rows := deleted_rows;
  elsif operation = 'member' then
    person_id := gen_random_uuid();
    insert into auth.users(id) values(person_id);
    insert into public.members(user_id,household_id,name) values(person_id,hid,trim(payload->>'name'));
  else raise exception 'Unknown operation';
  end if;
  return jsonb_build_object('ok',true,'entries',created_rows);
end $$;
revoke all on function public.shared_home_before_activity(text,text,jsonb) from public, anon, authenticated;

create function public.shared_agreements(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; actor_uid uuid; real_members uuid[]; ag public.agreements; am public.agreement_amendments;
  ev public.agreement_events; lg public.gym_logs; entry_row public.entries; item jsonb; chore jsonb;
  rotation uuid[]; sid uuid; sids uuid[] := '{}'; hrs numeric; base_date date; weeks integer;
  n integer := 0; w integer; eid text;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  if operation='get' then
    return jsonb_build_object(
      'agreements',(select coalesce(jsonb_agg(a order by a.slug),'[]') from public.agreements a where a.household_id=hid),
      'amendments',(select coalesce(jsonb_agg(m order by m.created_at desc,m.id),'[]') from public.agreement_amendments m where m.household_id=hid),
      'events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') from
        (select * from public.agreement_events where household_id=hid order by created_at desc,id limit 400) x),
      'logs',(select coalesce(jsonb_agg(g order by g.updated_at desc),'[]') from public.gym_logs g
        join public.entries e on e.id=g.entry_id where g.household_id=hid and e.date >= current_date - 180)
    );
  end if;
  actor_uid := nullif(payload->>'actor','')::uuid;
  if not exists(select 1 from public.members where household_id=hid and user_id=actor_uid and name<>'Housemates') then
    raise exception 'Choose a household member' using errcode='42501';
  end if;
  real_members := array(select user_id from public.members where household_id=hid and name<>'Housemates' order by name,user_id);
  if operation='save' then
    if coalesce(payload->>'slug','') not in ('house','gym') then raise exception 'Unknown agreement.'; end if;
    if coalesce(char_length(trim(payload->>'title')),0) not between 1 and 120 then
      raise exception 'Give the agreement a title under 120 characters.'; end if;
    if jsonb_typeof(payload->'terms') is distinct from 'object' then raise exception 'The agreement terms look wrong.'; end if;
    select * into ag from public.agreements where household_id=hid and slug=payload->>'slug' for update;
    if found and ag.status<>'draft' then
      raise exception 'This agreement is no longer a draft, so it cannot be edited directly.'; end if;
    insert into public.agreements(household_id,slug,title,terms) values(hid,payload->>'slug',trim(payload->>'title'),payload->'terms')
      on conflict(household_id,slug) do update set title=excluded.title,terms=excluded.terms,updated_at=now()
      returning * into ag;
    return jsonb_build_object('agreement',to_jsonb(ag));
  elsif operation in ('propose','revoke','sign') then
    select * into ag from public.agreements where household_id=hid and slug=coalesce(payload->>'slug','') for update;
    if not found then raise exception 'Save the agreement first.'; end if;
    if operation='propose' then
      if ag.status<>'draft' then raise exception 'This agreement has already been proposed.'; end if;
      if ag.terms='{}'::jsonb then raise exception 'Fill in the agreement terms before sending it over.'; end if;
      update public.agreements set status='proposed',signed_by=array[actor_uid],proposed_by=actor_uid,proposed_at=now(),updated_at=now()
        where id=ag.id returning * into ag;
    elsif operation='revoke' then
      if ag.status<>'proposed' then raise exception 'Only a proposed agreement can be pulled back.'; end if;
      if ag.proposed_by<>actor_uid then raise exception 'Only the person who proposed this agreement can pull it back.'; end if;
      update public.agreements set status='draft',signed_by='{}',proposed_by=null,proposed_at=null,updated_at=now()
        where id=ag.id returning * into ag;
    else
      if ag.status<>'proposed' then raise exception 'This agreement is not out for signatures.'; end if;
      if actor_uid=any(ag.signed_by) then raise exception 'You have already signed this agreement.'; end if;
      update public.agreements set signed_by=ag.signed_by||actor_uid,
        status=case when (ag.signed_by||actor_uid) @> real_members then 'active' else 'proposed' end,
        updated_at=now() where id=ag.id returning * into ag;
    end if;
    return jsonb_build_object('agreement',to_jsonb(ag));
  elsif operation='amend' then
    select * into ag from public.agreements where id=(payload->>'agreement_id')::uuid and household_id=hid;
    if not found then raise exception 'Agreement not found.'; end if;
    if ag.status<>'active' then raise exception 'Only an agreement in force can be amended.'; end if;
    if coalesce(char_length(trim(payload->>'title')),0) not between 1 and 160 then
      raise exception 'Give the amendment a title under 160 characters.'; end if;
    if coalesce(char_length(payload->>'body'),0) not between 1 and 4000 then
      raise exception 'Describe the amendment in under 4000 characters.'; end if;
    if payload->'terms_patch' is not null and jsonb_typeof(payload->'terms_patch') not in ('object','null') then
      raise exception 'The proposed term changes look wrong.'; end if;
    insert into public.agreement_amendments(household_id,agreement_id,title,body,terms_patch,proposed_by)
      values(hid,ag.id,trim(payload->>'title'),payload->>'body',
        case when jsonb_typeof(payload->'terms_patch')='object' then payload->'terms_patch' end,actor_uid)
      returning * into am;
    return jsonb_build_object('amendment',to_jsonb(am));
  elsif operation in ('amend_decide','amend_withdraw') then
    select * into am from public.agreement_amendments where id=(payload->>'id')::uuid and household_id=hid for update;
    if not found then raise exception 'Amendment not found.'; end if;
    if am.status<>'open' then raise exception 'This amendment has already been settled.'; end if;
    if operation='amend_withdraw' then
      if am.proposed_by<>actor_uid then raise exception 'Only the person who proposed this amendment can withdraw it.'; end if;
      update public.agreement_amendments set status='withdrawn',decided_by=actor_uid,decided_at=now()
        where id=am.id returning * into am;
      return jsonb_build_object('amendment',to_jsonb(am));
    end if;
    if am.proposed_by=actor_uid then raise exception 'Your housemate has to decide this amendment.'; end if;
    if jsonb_typeof(payload->'approve') is distinct from 'boolean' then raise exception 'Choose approve or decline.'; end if;
    if coalesce(char_length(payload->>'reason'),0) > 1000 then raise exception 'Keep the reason under 1000 characters.'; end if;
    if (payload->>'approve')::boolean then
      update public.agreement_amendments set status='approved',decided_by=actor_uid,decided_at=now()
        where id=am.id returning * into am;
      if am.terms_patch is not null then
        update public.agreements set terms=terms||am.terms_patch,updated_at=now() where id=am.agreement_id returning * into ag;
        return jsonb_build_object('amendment',to_jsonb(am),'agreement',to_jsonb(ag));
      end if;
    else
      update public.agreement_amendments set status='declined',decided_by=actor_uid,decided_at=now(),
        reason=nullif(trim(payload->>'reason'),'') where id=am.id returning * into am;
    end if;
    return jsonb_build_object('amendment',to_jsonb(am));
  elsif operation='event' then
    select * into ag from public.agreements where id=(payload->>'agreement_id')::uuid and household_id=hid;
    if not found then raise exception 'Agreement not found.'; end if;
    if coalesce(payload->>'kind','') not in ('skip_rollover','skip_cover','swap','reschedule','pto','sick','cover_repaid') then
      raise exception 'Unknown request kind.'; end if;
    item := coalesce(payload->'details','{}'::jsonb);
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'The request details look wrong.'; end if;
    hrs := nullif(payload->>'hours','')::numeric;
    if payload->>'kind'='pto' and (hrs is null or hrs<=0 or hrs>24 or mod(hrs*4,1)<>0) then
      raise exception 'Gym PTO is spent in quarter-hour steps.'; end if;
    if nullif(payload->>'entry_id','') is not null then
      select * into entry_row from public.entries where id=(payload->>'entry_id')::uuid and household_id=hid;
      if not found then raise exception 'That calendar entry could not be found.'; end if;
    end if;
    if payload->>'kind' in ('swap','skip_cover') then
      if jsonb_typeof(item->'entry_ids') is distinct from 'array'
        or jsonb_array_length(item->'entry_ids') not between 1 and 20 then
        raise exception 'Pick between one and twenty chores for this request.'; end if;
      for eid in select value from jsonb_array_elements_text(item->'entry_ids') loop
        if not exists(select 1 from public.entries where id=eid::uuid and household_id=hid and kind='task') then
          raise exception 'One of those chores is no longer on the calendar.'; end if;
      end loop;
    elsif payload->>'kind'='reschedule' then
      if entry_row.id is null then raise exception 'Pick the gym session to reschedule.'; end if;
      if coalesce(item->>'new_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or coalesce(item->>'new_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Pick a new date and a time like 18:30.'; end if;
    elsif payload->>'kind'='skip_rollover' and entry_row.id is not null then
      update public.entries set date=date+7 where id=entry_row.id and household_id=hid and kind='task';
      if not found then raise exception 'Only a chore can roll forward a week.'; end if;
    end if;
    insert into public.agreement_events(household_id,agreement_id,entry_id,kind,status,actor,hours,details)
      values(hid,ag.id,entry_row.id,payload->>'kind',
        case when payload->>'kind' in ('pto','sick','skip_rollover','cover_repaid') then 'done' else 'open' end,
        actor_uid,hrs,item)
      returning * into ev;
    return jsonb_build_object('event',to_jsonb(ev));
  elsif operation='event_decide' then
    select * into ev from public.agreement_events where id=(payload->>'id')::uuid and household_id=hid for update;
    if not found then raise exception 'Request not found.'; end if;
    if ev.status<>'open' then raise exception 'This request has already been answered.'; end if;
    if ev.actor=actor_uid then raise exception 'Your housemate has to answer this request.'; end if;
    if jsonb_typeof(payload->'accept') is distinct from 'boolean' then raise exception 'Choose accept or decline.'; end if;
    if (payload->>'accept')::boolean then
      if ev.kind='swap' then
        for eid in select value from jsonb_array_elements_text(ev.details->'entry_ids') loop
          update public.entries set assignee=case when assignee=real_members[1] then real_members[2] else real_members[1] end
            where id=eid::uuid and household_id=hid and kind='task';
        end loop;
      elsif ev.kind='skip_cover' then
        for eid in select value from jsonb_array_elements_text(ev.details->'entry_ids') loop
          update public.entries set assignee=actor_uid where id=eid::uuid and household_id=hid and kind='task';
        end loop;
      elsif ev.kind='reschedule' then
        update public.entries set date=(ev.details->>'new_date')::date,time_of_day=ev.details->>'new_time'
          where id=ev.entry_id and household_id=hid;
        if not found then raise exception 'That gym session is no longer on the calendar.'; end if;
      end if;
      update public.agreement_events set status='accepted',decided_by=actor_uid,decided_at=now()
        where id=ev.id returning * into ev;
    else
      update public.agreement_events set status='declined',decided_by=actor_uid,decided_at=now()
        where id=ev.id returning * into ev;
    end if;
    return jsonb_build_object('event',to_jsonb(ev));
  elsif operation='log' then
    select * into entry_row from public.entries where id=(payload->>'entry_id')::uuid and household_id=hid;
    if not found or entry_row.kind<>'event' or entry_row.category<>'Gym' then
      raise exception 'Workout logs attach to gym sessions only.'; end if;
    if coalesce(payload->>'day_type','') not in ('Push','Pull','Legs') then raise exception 'Pick Push, Pull, or Legs.'; end if;
    if jsonb_typeof(payload->'weights_minutes') is distinct from 'number' or (payload->>'weights_minutes') !~ '^[0-9]+$'
      or jsonb_typeof(payload->'cardio_minutes') is distinct from 'number' or (payload->>'cardio_minutes') !~ '^[0-9]+$' then
      raise exception 'Minutes are whole numbers.'; end if;
    if (payload->>'weights_minutes')::int > 120 or (payload->>'cardio_minutes')::int > 120 then
      raise exception 'Minutes go up to 120 per session.'; end if;
    if payload->'exercises' is not null and jsonb_typeof(payload->'exercises') not in ('array','null') then
      raise exception 'The exercises look wrong.'; end if;
    if coalesce(char_length(payload->>'notes'),0) > 2000 then raise exception 'Keep the notes under 2000 characters.'; end if;
    insert into public.gym_logs(household_id,entry_id,member,day_type,weights_minutes,cardio_minutes,exercises,notes)
      values(hid,entry_row.id,actor_uid,payload->>'day_type',(payload->>'weights_minutes')::int,(payload->>'cardio_minutes')::int,
        case when jsonb_typeof(payload->'exercises')='array' then payload->'exercises' else '[]'::jsonb end,
        coalesce(payload->>'notes',''))
      on conflict(entry_id,member) do update set day_type=excluded.day_type,weights_minutes=excluded.weights_minutes,
        cardio_minutes=excluded.cardio_minutes,exercises=excluded.exercises,notes=excluded.notes,updated_at=now()
      returning * into lg;
    return jsonb_build_object('log',to_jsonb(lg));
  elsif operation='set_sessions' then
    select * into ag from public.agreements where id=(payload->>'agreement_id')::uuid and household_id=hid for update;
    if not found then raise exception 'Agreement not found.'; end if;
    if ag.slug<>'gym' then raise exception 'Sessions belong to the gym agreement.'; end if;
    if ag.status<>'active' then raise exception 'Sign the gym agreement before putting sessions on the calendar.'; end if;
    sid := nullif(payload->>'series_id','')::uuid;
    base_date := nullif(payload->>'from_date','')::date;
    if sid is null or base_date is null then raise exception 'The session series needs an id and a start date.'; end if;
    if jsonb_typeof(payload->'sessions') is distinct from 'array' or jsonb_array_length(payload->'sessions') > 250 then
      raise exception 'Send up to 250 gym sessions at a time.'; end if;
    delete from public.entries where household_id=hid and series_id=sid and date>=base_date and category='Gym';
    for w in select g from generate_series(0,jsonb_array_length(payload->'sessions')-1) g loop
      item := payload->'sessions'->w;
      if coalesce(item->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or coalesce(item->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(char_length(trim(item->>'title')),0) not between 1 and 160 then
        raise exception 'Each session needs a date, a time like 06:30, and a title.'; end if;
      insert into public.entries(household_id,created_by,kind,title,description,category,date,series_id,time_of_day)
        values(hid,actor_uid,'event',trim(item->>'title'),'','Gym',(item->>'date')::date,sid,item->>'time');
      n := n+1;
    end loop;
    update public.agreements set terms=terms||jsonb_build_object('gym_series_id',sid),updated_at=now() where id=ag.id;
    return jsonb_build_object('count',n);
  elsif operation='set_chores' then
    select * into ag from public.agreements where id=(payload->>'agreement_id')::uuid and household_id=hid for update;
    if not found then raise exception 'Agreement not found.'; end if;
    if ag.slug<>'house' then raise exception 'Chores belong to the house agreement.'; end if;
    if ag.status<>'active' then raise exception 'Sign the house agreement before scheduling the chores.'; end if;
    base_date := nullif(payload->>'first_date','')::date;
    if base_date is null then raise exception 'Pick the first chore date.'; end if;
    if coalesce(payload->>'weeks','') !~ '^[0-9]+$' or (payload->>'weeks')::int not between 1 and 52 then
      raise exception 'Chores can be scheduled one to 52 weeks ahead.'; end if;
    weeks := (payload->>'weeks')::int;
    if jsonb_typeof(payload->'chores') is distinct from 'array' or jsonb_array_length(payload->'chores') > 6 then
      raise exception 'Keep it to six chores at most.'; end if;
    if jsonb_typeof(ag.terms->'chore_series_ids')='array' then
      delete from public.entries where household_id=hid and date>=current_date
        and series_id in (select value::uuid from jsonb_array_elements_text(ag.terms->'chore_series_ids'));
    end if;
    for n in select g from generate_series(0,jsonb_array_length(payload->'chores')-1) g loop
      chore := payload->'chores'->n;
      if coalesce(char_length(trim(chore->>'title')),0) not between 1 and 160 then raise exception 'Each chore needs a title.'; end if;
      if coalesce(char_length(chore->>'description'),0) > 2000 then raise exception 'Keep each chore checklist under 2000 characters.'; end if;
      if coalesce(chore->>'weekday','') !~ '^[0-6]$' then raise exception 'Each chore needs a weekday.'; end if;
      if jsonb_typeof(chore->'rotation') is distinct from 'array' or jsonb_array_length(chore->'rotation')<>2 then
        raise exception 'Each chore rotates between your two housemates.'; end if;
      rotation := array[(chore->'rotation'->>0)::uuid,(chore->'rotation'->>1)::uuid];
      if rotation[1] is null or rotation[2] is null or rotation[1]=rotation[2] or not (rotation <@ real_members) then
        raise exception 'Each chore rotates between your two housemates.'; end if;
      sid := gen_random_uuid();
      sids := sids||sid;
      for w in select g from generate_series(0,weeks-1) g loop
        insert into public.entries(household_id,created_by,kind,title,description,category,date,assignee,series_id,rotation_members)
          values(hid,actor_uid,'task',trim(chore->>'title'),coalesce(chore->>'description',''),'Chore',
            base_date+(chore->>'weekday')::int+w*7,rotation[(w%2)+1],sid,rotation);
      end loop;
    end loop;
    update public.agreements set terms=terms||jsonb_build_object('chore_series_ids',to_jsonb(sids)),updated_at=now() where id=ag.id;
    return jsonb_build_object('series_ids',to_jsonb(sids));
  else raise exception 'Unknown operation';
  end if;
end $$;
revoke all on function public.shared_agreements(text,text,jsonb) from public, authenticated;
grant execute on function public.shared_agreements(text,text,jsonb) to anon;
commit;
