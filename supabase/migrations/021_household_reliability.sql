-- Narrow gateways, durable delivery state, and append-only agreement schedules.
-- Requires 020. No historical gateway body is copied here.
begin;

-- Archive by completion, not creation: an old request bought today is recent.
-- Leave pre-existing completion times unknown rather than inventing history.
alter table public.entries add column completed_at timestamptz;
create function public.stamp_entry_completion() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.done is distinct from old.done then
    new.completed_at:=case when new.done then clock_timestamp() else null end;
  end if;
  return new;
end $$;
revoke all on function public.stamp_entry_completion() from public,anon,authenticated;
create trigger stamp_entry_completion before update of done on public.entries
  for each row execute function public.stamp_entry_completion();

create table public.household_reminder_runs (
  household_id uuid not null references public.households(id),
  edition text not null check (edition in ('morning','evening')),
  date date not null,
  run_id uuid not null default gen_random_uuid(),
  status text not null check (status in ('sending','sent','partial','failed','empty','disabled')),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  attempts integer not null default 1,
  sent integer not null default 0,
  failed integer not null default 0,
  error_code text check (error_code in ('push_failed','database_failed','not_configured')),
  primary key (household_id,edition,date)
);
create table public.household_reminder_deliveries (
  household_id uuid not null references public.households(id),
  edition text not null,
  date date not null,
  endpoint_hash text not null check (length(endpoint_hash)=64),
  sent_at timestamptz not null default clock_timestamp(),
  primary key (household_id,edition,date,endpoint_hash),
  foreign key (household_id,edition,date) references public.household_reminder_runs(household_id,edition,date) on delete cascade
);
create table public.household_notification_cooldowns (
  household_id uuid not null references public.households(id),
  slot text not null check (length(slot) between 1 and 200),
  claim uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  primary key (household_id,slot)
);
create table public.agreement_schedule_state (
  series_id uuid primary key,
  household_id uuid not null references public.households(id),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  kind text not null check (kind in ('gym','chore')),
  anchor_date date not null,
  through_date date not null,
  next_cycle smallint not null default 0 check (next_cycle between 0 and 2),
  template jsonb not null default '{}'
);
create table public.bill_ledger_payments (
  bill_id uuid not null references public.entries(id) on delete cascade,
  member uuid not null references public.members(user_id),
  expense_id uuid not null references public.household_expenses(id),
  created_paid_check boolean not null,
  primary key (bill_id,member)
);
create index bill_ledger_payments_expense on public.bill_ledger_payments(expense_id);
create index entries_window on public.entries(household_id,date,created_at,id);
create index entries_history on public.entries(household_id,created_at desc,id desc);

alter table public.household_reminder_runs enable row level security;
alter table public.household_reminder_deliveries enable row level security;
alter table public.household_notification_cooldowns enable row level security;
alter table public.agreement_schedule_state enable row level security;
alter table public.bill_ledger_payments enable row level security;
revoke all on public.household_reminder_runs, public.household_reminder_deliveries,
  public.household_notification_cooldowns, public.agreement_schedule_state,
  public.bill_ledger_payments from public, anon, authenticated;

-- Preserve existing series, including ones whose horizon has already elapsed.
insert into public.agreement_schedule_state(series_id,household_id,agreement_id,kind,anchor_date,through_date,next_cycle,template)
select e.series_id,a.household_id,a.id,case when a.slug='gym' then 'gym' else 'chore' end,
  case when a.slug='gym' then date_trunc('week',min(e.date))::date else min(e.date) end,
  max(e.date),
  case when a.slug='gym' then case (array_agg(e.title order by e.date desc,e.created_at desc))[1]
    when 'Push day' then 1 when 'Pull day' then 2 else 0 end else 0 end,
  case when a.slug='house' then jsonb_build_object('title',(array_agg(e.title order by e.date))[1],
    'description',(array_agg(e.description order by e.date))[1],
    'rotation',(array_agg(to_jsonb(e.rotation_members) order by e.date))[1]) else '{}'::jsonb end
from public.agreements a join public.entries e on e.household_id=a.household_id and (
  (a.slug='gym' and e.category='Gym' and e.series_id=nullif(a.terms->>'gym_series_id','')::uuid) or
  (a.slug='house' and e.category='Chore' and a.terms->'chore_series_ids' @> to_jsonb(array[e.series_id::text]))
)
where e.date is not null and e.series_id is not null
group by e.series_id,a.household_id,a.id,a.slug;

-- Original cover payments used the bill id as their idempotency key.
insert into public.bill_ledger_payments(bill_id,member,expense_id,created_paid_check)
select b.id,m.value::uuid,x.id,true from public.entries b
join public.household_expenses x on x.id=b.id and x.household_id=b.household_id and x.kind='expense'
cross join lateral jsonb_object_keys(x.shares) m(value)
where b.kind='event' and b.category in ('Rent','Bill') and m.value::uuid=any(b.payment_members);

create function public.protect_bill_ledger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if (new.amount_cents,new.paid_by,new.shares,new.kind,new.recipient) is distinct from
       (old.amount_cents,old.paid_by,old.shares,old.kind,old.recipient)
       and exists(select 1 from public.bill_ledger_payments where expense_id=old.id) then
      raise exception 'Delete this linked bill expense and log it again to change its amount or split.';
    end if;
    return new;
  end if;
  -- Lock bills in a stable order; deletion and a concurrent cover serialize.
  perform 1 from public.entries where id in (select bill_id from public.bill_ledger_payments where expense_id=old.id)
    order by id for update;
  update public.entries b set paid_by=array(select p from unnest(b.paid_by) p where not exists(
    select 1 from public.bill_ledger_payments l where l.expense_id=old.id and l.bill_id=b.id
      and l.member=p and l.created_paid_check
  )) where b.id in (select bill_id from public.bill_ledger_payments where expense_id=old.id);
  delete from public.bill_ledger_payments where expense_id=old.id;
  return old;
end $$;
revoke all on function public.protect_bill_ledger() from public,anon,authenticated;
create trigger protect_bill_ledger before update or delete on public.household_expenses
  for each row execute function public.protect_bill_ledger();

-- A linked bill cannot be rewritten/deleted independently of its ledger.
create function public.protect_linked_bill() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.bill_ledger_payments where bill_id=old.id) then
    if tg_op='DELETE' then raise exception 'Delete the linked bill expense before deleting this bill.'; end if;
    if (new.amount,new.payment_members,new.kind,new.category) is distinct from
       (old.amount,old.payment_members,old.kind,old.category) then
      raise exception 'Delete the linked bill expense before changing its amount or split.';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_linked_bill() from public,anon,authenticated;
create trigger protect_linked_bill before update or delete on public.entries
  for each row execute function public.protect_linked_bill();

alter function public.shared_home(text,text,jsonb) rename to shared_home_legacy;
revoke all on function public.shared_home_legacy(text,text,jsonb) from public,anon,authenticated;
create function public.shared_home(access_token text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare hid uuid; today date := (now() at time zone 'America/New_York')::date;
  first_day date; last_day date; cursor_row public.entries; b public.entries;
  actor uuid; selected uuid[]; m uuid; cents integer; share integer; total integer:=0;
  parts jsonb:='{}'; eid uuid; result jsonb; rows jsonb; more boolean; n integer; pos integer;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  if operation in ('get','history') then
    first_day:=coalesce(nullif(payload->>'from_date','')::date,today-35);
    last_day:=coalesce(nullif(payload->>'until_date','')::date,today+190);
    if last_day<first_day or last_day>first_day+366 then raise exception 'Choose a date window of at most one year.'; end if;
    if payload->>'cursor' is not null then
      select * into cursor_row from public.entries where household_id=hid and id=(payload->>'cursor')::uuid;
      if not found then raise exception 'History cursor expired. Refresh and try again.'; end if;
    end if;
    n:=case when operation='history' then 50 else 500 end;
    with page as materialized (
      select e.* from public.entries e where e.household_id=hid
        and (cursor_row.id is null or (e.created_at,e.id)<(cursor_row.created_at,cursor_row.id))
        and case when operation='history' then
          (e.done or (e.kind='event' and e.date<today-35))
        else
          (e.date between first_day and last_day or
           (not e.done and e.kind in ('task','request','note') and (e.date is null or e.date<=last_day)) or
           (e.done and e.date is null and coalesce(e.completed_at,e.created_at)>=(today-35)::timestamptz)) end
      order by e.created_at desc,e.id desc limit n+1
    ), visible as materialized (select * from page order by created_at desc,id desc limit n)
    select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc,v.id desc),'[]'),
      (select count(*)>n from page) into rows,more from visible v;
    result:=jsonb_build_object('entries',rows,'next_cursor',case when more then rows->(n-1)->>'id' else null end);
    if operation='get' then
      result:=result||jsonb_build_object(
        'household',(select to_jsonb(h) from public.households h where h.id=hid),
        'members',(select coalesce(jsonb_agg(person order by person.name),'[]') from public.members person where person.household_id=hid),
        'activity',(select coalesce(jsonb_agg(to_jsonb(a)-'household_id' order by a.created_at desc,a.id),'[]')
          from (select * from public.house_activity where household_id=hid order by created_at desc,id desc limit 20) a)
      );
    end if;
    return result;
  end if;
  if operation='member' then
    perform 1 from public.households where id=hid for update;
    if (select count(*) from public.members where household_id=hid and name<>'Housemates')>=2 then
      raise exception 'Adding more than two housemates is disabled until agreements support larger rosters.';
    end if;
  end if;
  if operation='payment' then
    actor:=nullif(payload->>'actor','')::uuid;
    if not exists(select 1 from public.members where household_id=hid and user_id=actor and name<>'Housemates') then
      raise exception 'Choose a household member' using errcode='42501'; end if;
    select * into b from public.entries where household_id=hid and id=(payload->>'id')::uuid for update;
    if not found or b.kind<>'event' or b.category not in ('Rent','Bill') or not (actor=any(b.payment_members)) then
      raise exception 'This bill is not assigned to you'; end if;
    if payload->>'paid'='false' and exists(select 1 from public.bill_ledger_payments where bill_id=b.id and member=actor) then
      raise exception 'Delete the linked bill expense before clearing this payment.'; end if;
    if payload->>'cover'='true' or payload->>'log_share'='true' then
      if b.amount is null or b.amount<=0 then raise exception 'Add the bill amount before logging a payment.'; end if;
      if payload->>'log_share'='true' then
        select expense_id into eid from public.bill_ledger_payments where bill_id=b.id and member=actor;
        if found then return jsonb_build_object('ok',true,'expense',(select to_jsonb(x) from public.household_expenses x where id=eid)); end if;
        selected:=array[actor];
      else
        selected:=array(select p from unnest(b.payment_members) p where not (p=any(b.paid_by)));
        if cardinality(selected)=0 then return jsonb_build_object('ok',true); end if;
      end if;
      cents:=round(b.amount*100)::integer;
      pos:=0;
      for m in select p from unnest(b.payment_members) p order by p loop
        share:=cents/cardinality(b.payment_members)+case when pos<cents%cardinality(b.payment_members) then 1 else 0 end;
        if m=any(selected) then parts:=parts||jsonb_build_object(m::text,share); total:=total+share; end if;
        pos:=pos+1;
      end loop;
      if total=0 then raise exception 'This share is zero; there is nothing to log.'; end if;
      eid:=md5(b.id::text||':'||actor::text||':'||selected::text)::uuid;
      result:=public.shared_expenses(access_token,'create',jsonb_build_object('id',eid,'actor',actor,
        'kind','expense','title',b.title,'date',today,'amount_cents',total,'paid_by',actor,'shares',parts));
      foreach m in array selected loop
        insert into public.bill_ledger_payments values(b.id,m,eid,not (m=any(b.paid_by)));
      end loop;
      update public.entries set paid_by=array(select distinct p from unnest(b.paid_by||selected) p) where id=b.id;
      if cardinality(b.paid_by)<cardinality(b.paid_by||selected) and not (selected<@b.paid_by) then
        insert into public.house_activity(household_id,actor,action,title) values(hid,actor,'paid',b.title);
      end if;
      return result||jsonb_build_object('ok',true,'entries',jsonb_build_array((select to_jsonb(e) from public.entries e where id=b.id)),
        'activity',(select coalesce(jsonb_agg(to_jsonb(a)-'household_id' order by a.created_at desc,a.id),'[]')
          from (select * from public.house_activity where household_id=hid order by created_at desc,id desc limit 20) a));
    end if;
  end if;
  -- Never let a client supply a bill expense; its cents and split are authoritative above.
  return public.shared_home_legacy(access_token,operation,case when operation='payment' then payload-'expense' else payload end);
end $$;
revoke all on function public.shared_home(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_home(text,text,jsonb) to anon;

-- Capture schedule metadata when the existing editor intentionally regenerates.
alter function public.shared_agreements(text,text,jsonb) rename to shared_agreements_legacy;
revoke all on function public.shared_agreements_legacy(text,text,jsonb) from public,anon,authenticated;
create function public.shared_agreements(access_token text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; ag public.agreements; e record;
begin
  result:=public.shared_agreements_legacy(access_token,operation,payload);
  if operation in ('set_sessions','set_chores') then
    select * into ag from public.agreements where id=(payload->>'agreement_id')::uuid;
    delete from public.agreement_schedule_state where agreement_id=ag.id;
    for e in select x.series_id,min(x.date) as first_date,max(x.date) as last_date,
      (array_agg(x.title order by x.date desc,x.created_at desc))[1] as last_title,
      (array_agg(x.title order by x.date))[1] as title,
      (array_agg(x.description order by x.date))[1] as description,
      (array_agg(to_jsonb(x.rotation_members) order by x.date))[1] as rotation
      from public.entries x where x.household_id=ag.household_id and x.series_id is not null and (
        (ag.slug='gym' and x.series_id=(ag.terms->>'gym_series_id')::uuid) or
        (ag.slug='house' and ag.terms->'chore_series_ids' @> to_jsonb(array[x.series_id::text]))
      ) group by x.series_id loop
      insert into public.agreement_schedule_state values(e.series_id,ag.household_id,ag.id,
        case when ag.slug='gym' then 'gym' else 'chore' end,
        case when ag.slug='gym' then date_trunc('week',e.first_date)::date else e.first_date end,
        e.last_date,case e.last_title when 'Push day' then 1 when 'Pull day' then 2 else 0 end,
        case when ag.slug='house' then jsonb_build_object('title',e.title,'description',e.description,'rotation',e.rotation) else '{}'::jsonb end);
    end loop;
  end if;
  return result;
end $$;
revoke all on function public.shared_agreements(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_agreements(text,text,jsonb) to anon;

create function public.shared_household_ops(access_token text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare hid uuid; today date:=(now() at time zone 'America/New_York')::date; digest_edition text; claim_id uuid;
  run public.household_reminder_runs; s public.agreement_schedule_state; ag public.agreements;
  day date; finish date; gym_slot jsonb; type text; cycle integer; minutes integer; target integer; actor uuid;
  inserted integer:=0; failed integer:=0; before_inserted integer; rotation uuid[]; template_index integer;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  if payload ? 'actor' and not exists(select 1 from public.members
    where household_id=hid and user_id=nullif(payload->>'actor','')::uuid and name<>'Housemates') then
    raise exception 'Choose a household member' using errcode='42501';
  end if;
  if operation='status' then
    return jsonb_build_object('schema_version','021','reminders',(
      select coalesce(jsonb_agg(to_jsonb(r)-'household_id'-'run_id'),'[]') from (
        select distinct on (edition) * from public.household_reminder_runs where household_id=hid order by edition,date desc
      ) r),'schedules',(select coalesce(jsonb_agg(jsonb_build_object('kind',sched.kind,'through_date',sched.through_date)),'[]')
        from public.agreement_schedule_state sched join public.agreements a on a.id=sched.agreement_id
        where sched.household_id=hid and a.status='active'));
  elsif operation='claim_cooldown' then
    if coalesce(length(payload->>'slot'),0) not between 1 and 200 then raise exception 'Invalid cooldown slot'; end if;
    delete from public.household_notification_cooldowns where household_id=hid and expires_at<=clock_timestamp();
    insert into public.household_notification_cooldowns(household_id,slot,expires_at)
      values(hid,payload->>'slot',clock_timestamp()+make_interval(secs=>case when payload->>'handoff'='true' then 60 else 900 end))
      on conflict(household_id,slot) do nothing returning claim into claim_id;
    return jsonb_build_object('claim',claim_id);
  elsif operation='release_cooldown' then
    delete from public.household_notification_cooldowns where household_id=hid and slot=payload->>'slot' and claim=(payload->>'claim')::uuid;
    return jsonb_build_object('ok',true);
  elsif operation in ('claim_digest','digest_delivered','finish_digest') then
    digest_edition:=payload->>'edition';
    if digest_edition is null or digest_edition not in ('morning','evening') then raise exception 'Invalid digest edition'; end if;
    if operation='claim_digest' then
      delete from public.household_reminder_runs where household_id=hid and date<today-90;
      insert into public.household_reminder_runs(household_id,edition,date,status) values(hid,digest_edition,today,'sending')
        on conflict(household_id,edition,date) do update set run_id=gen_random_uuid(),status='sending',
          started_at=clock_timestamp(),finished_at=null,attempts=household_reminder_runs.attempts+1,failed=0,error_code=null
        where household_reminder_runs.status in ('failed','partial') or
          (household_reminder_runs.status='sending' and household_reminder_runs.started_at<clock_timestamp()-interval '2 minutes')
        returning * into run;
      return jsonb_build_object('claim',run.run_id,'delivered',(
        select coalesce(jsonb_agg(endpoint_hash),'[]') from public.household_reminder_deliveries
        where household_id=hid and household_reminder_deliveries.edition=digest_edition and date=today));
    end if;
    select * into run from public.household_reminder_runs where household_id=hid and household_reminder_runs.edition=digest_edition
      and date=today and run_id=(payload->>'claim')::uuid and status='sending' for update;
    if not found then raise exception 'Digest claim expired'; end if;
    if operation='digest_delivered' then
      insert into public.household_reminder_deliveries(household_id,edition,date,endpoint_hash)
        values(hid,digest_edition,today,payload->>'endpoint_hash') on conflict do nothing;
    else
      update public.household_reminder_runs set status=payload->>'status',finished_at=clock_timestamp(),
        sent=(select count(*) from public.household_reminder_deliveries d where d.household_id=hid and d.edition=digest_edition and d.date=today),
        failed=coalesce((payload->>'failed')::integer,0),error_code=payload->>'error_code'
      where household_id=hid and household_reminder_runs.edition=digest_edition and date=today and run_id=run.run_id;
    end if;
    return jsonb_build_object('ok',true);
  elsif operation='roll_forward' then
    for s in select * from public.agreement_schedule_state where household_id=hid and through_date<today+14 order by series_id loop
      select * into ag from public.agreements where id=s.agreement_id and status='active' for update;
      if not found then continue; end if;
      select * into s from public.agreement_schedule_state where series_id=s.series_id for update;
      if not found or s.through_date>=today+14 then continue; end if;
      actor:=ag.signed_by[1];
      if not exists(select 1 from public.members where household_id=hid and user_id=actor and name<>'Housemates') then continue; end if;
      before_inserted:=inserted;
      begin
        cycle:=s.next_cycle;
        finish:=today+case when s.kind='gym' then 56 else 182 end;
        if s.kind='chore' then rotation:=array(select value::uuid from jsonb_array_elements_text(s.template->'rotation')); end if;
        day:=s.through_date+case when s.kind='gym' then 1 else 7 end;
        while day<=finish loop
          if s.kind='gym' then
            template_index:=(extract(isodow from day)::integer-1);
            gym_slot:=ag.terms->'template'->template_index;
            if gym_slot->>'on'='true' then
              type:=case when gym_slot->>'day_type'='Auto' then (array['Push','Pull','Legs'])[cycle+1] else gym_slot->>'day_type' end;
              cycle:=case type when 'Push' then 1 when 'Pull' then 2 when 'Legs' then 0 else null end;
              if cycle is null then raise exception 'Invalid gym template'; end if;
              minutes:=split_part(coalesce(gym_slot->>'time','07:00'),':',1)::integer*60+split_part(coalesce(gym_slot->>'time','07:00'),':',2)::integer;
              if ag.terms->'ramp' is not null and ag.terms->'ramp'<>'null'::jsonb then
                target:=split_part(ag.terms->'ramp'->>'target_time',':',1)::integer*60+split_part(ag.terms->'ramp'->>'target_time',':',2)::integer;
                minutes:=case when day>(ag.terms->'ramp'->>'target_date')::date then target else greatest(target,
                  split_part(ag.terms->'ramp'->>'start_time',':',1)::integer*60+split_part(ag.terms->'ramp'->>'start_time',':',2)::integer-
                  ((day-s.anchor_date)/7)*(ag.terms->'ramp'->>'weekly_shift_min')::integer) end;
              end if;
              if day>=today then
                insert into public.entries(household_id,created_by,kind,title,category,date,series_id,time_of_day)
                  values(hid,actor,'event',type||' day','Gym',day,s.series_id,lpad((minutes/60)::text,2,'0')||':'||lpad((minutes%60)::text,2,'0'));
                inserted:=inserted+1;
              end if;
            end if;
          elsif day>=today then
            if cardinality(rotation)<>2 then raise exception 'Invalid chore rotation'; end if;
            insert into public.entries(household_id,created_by,kind,title,description,category,date,assignee,series_id,rotation_members)
              values(hid,actor,'task',s.template->>'title',s.template->>'description','Chore',day,
                rotation[(((day-s.anchor_date)/7)%2)+1],s.series_id,rotation);
            inserted:=inserted+1;
          end if;
          day:=day+case when s.kind='gym' then 1 else 7 end;
        end loop;
        update public.agreement_schedule_state set through_date=case when s.kind='gym' then finish else day-7 end,next_cycle=cycle where series_id=s.series_id;
      exception when others then inserted:=before_inserted; failed:=failed+1; end;
    end loop;
    return jsonb_build_object('inserted',inserted,'failed',failed);
  end if;
  raise exception 'Unknown operation';
end $$;
revoke all on function public.shared_household_ops(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_household_ops(text,text,jsonb) to anon;

-- Internal reads (including 020's edit-undo response) must also be bounded.
-- Retain the original validation/write body behind this tiny read adapter.
alter function public.shared_home_before_timing(text,text,jsonb) rename to shared_home_base_writes;
revoke all on function public.shared_home_base_writes(text,text,jsonb) from public,anon,authenticated;
create function public.shared_home_before_timing(access_token text,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if operation='get' then return public.shared_home(access_token,'get',payload); end if;
  return public.shared_home_base_writes(access_token,operation,payload);
end $$;
revoke all on function public.shared_home_before_timing(text,text,jsonb) from public,anon,authenticated;
commit;
