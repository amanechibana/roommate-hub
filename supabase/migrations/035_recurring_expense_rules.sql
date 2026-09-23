begin;
create table public.house_expense_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 160),
  amount_cents integer not null check(amount_cents between 1 and 100000000),
  paid_by uuid not null,
  shares jsonb not null,
  category text not null default '',
  frequency text not null check(frequency in ('weekly','monthly')),
  anchor_date date not null,
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key(household_id,paid_by) references public.members(household_id,user_id),
  foreign key(household_id,created_by) references public.members(household_id,user_id)
);
create table public.house_expense_drafts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  rule_id uuid not null references public.house_expense_rules(id) on delete cascade,
  period date not null,
  status text not null default 'open' check(status in ('open','posted','skipped')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  unique(rule_id,period),
  foreign key(household_id,reviewed_by) references public.members(household_id,user_id)
);
create index house_expense_rules_household on public.house_expense_rules(household_id);
create index house_expense_drafts_household on public.house_expense_drafts(household_id);
alter table public.house_expense_rules enable row level security;
alter table public.house_expense_drafts enable row level security;
revoke all on public.house_expense_rules,public.house_expense_drafts from public,anon,authenticated;
create function public.shared_expense_rules(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; actor uuid; source public.household_expenses; rule public.house_expense_rules; draft public.house_expense_drafts; period_date date; today date;
begin
  hid:=public.coordination_identity(access_token,payload->>'actor');
  actor:=nullif(payload->>'actor','')::uuid;
  if operation not in ('get','create','review','stop') then raise exception 'Invalid rule action'; end if;
  if operation<>'get' and (actor is null or not exists(select 1 from public.members where household_id=hid and user_id=actor and active and name<>'Housemates')) then raise exception 'Sign in as a housemate'; end if;
  if operation='create' then
    select * into source from public.household_expenses where household_id=hid and id=(payload->>'expense_id')::uuid and kind='expense';
    if not found then raise exception 'Choose an existing charge'; end if;
    if payload->>'frequency' not in ('weekly','monthly') then raise exception 'Choose weekly or monthly'; end if;
    insert into public.house_expense_rules(household_id,title,amount_cents,paid_by,shares,category,frequency,anchor_date,created_by)
    values(hid,source.title,source.amount_cents,source.paid_by,source.shares,coalesce(source.category,''),payload->>'frequency',source.date,actor);
  elsif operation='stop' then
    update public.house_expense_rules set active=false where household_id=hid and id=(payload->>'id')::uuid;
    if not found then raise exception 'Rule not found'; end if;
  elsif operation='review' then
    select * into draft from public.house_expense_drafts where household_id=hid and id=(payload->>'id')::uuid for update;
    if not found or draft.status<>'open' then raise exception 'Draft already reviewed'; end if;
    if payload->>'decision' not in ('post','skip') then raise exception 'Choose post or skip'; end if;
    if payload->>'decision'='post' then
      select * into rule from public.house_expense_rules where id=draft.rule_id and household_id=hid;
      perform public.shared_expenses(access_token,'create',jsonb_build_object('actor',actor,'id',draft.id,'kind','expense','title',rule.title,'date',draft.period,'amount_cents',rule.amount_cents,'paid_by',rule.paid_by,'shares',rule.shares,'category',rule.category));
    end if;
    update public.house_expense_drafts set status=case when payload->>'decision'='post' then 'posted' else 'skipped' end,reviewed_by=actor,reviewed_at=now() where id=draft.id;
  end if;
  -- The active cycle's draft is materialized once. Past cycles are not silently backfilled.
  today:=public.household_today(hid);
  for rule in select * from public.house_expense_rules where household_id=hid and active loop
    if rule.frequency='monthly' then
      period_date:=make_date(extract(year from today)::integer,extract(month from today)::integer,
        least(extract(day from rule.anchor_date)::integer,extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::integer));
    else
      period_date:=rule.anchor_date+((today-rule.anchor_date)/7)*7;
    end if;
    if period_date>rule.anchor_date and period_date<=today then
      insert into public.house_expense_drafts(household_id,rule_id,period) values(hid,rule.id,period_date) on conflict(rule_id,period) do nothing;
    end if;
  end loop;
  return jsonb_build_object(
    'rules',(select coalesce(jsonb_agg(r order by r.created_at desc),'[]'::jsonb) from public.house_expense_rules r where household_id=hid),
    'drafts',(select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('title',r.title,'amount_cents',r.amount_cents,'paid_by',r.paid_by,'shares',r.shares,'category',r.category,'frequency',r.frequency,'possible_duplicate',exists(select 1 from public.household_expenses e where e.household_id=hid and e.id<>d.id and lower(e.title)=lower(r.title) and (case when r.frequency='monthly' then date_trunc('month',e.date)=date_trunc('month',d.period) else e.date>=d.period and e.date<d.period+7 end))) order by d.period desc,d.id),'[]'::jsonb) from public.house_expense_drafts d join public.house_expense_rules r on r.id=d.rule_id where d.household_id=hid and d.status='open')
  );
end $$;
revoke all on function public.shared_expense_rules(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_expense_rules(text,text,jsonb) to anon;
commit;
