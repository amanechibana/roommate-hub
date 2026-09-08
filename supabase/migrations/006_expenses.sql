-- Shared purchases and repayments, kept separate from calendar bill reminders.
begin;
create table public.household_expenses (
  id uuid primary key,
  household_id uuid not null references public.households(id),
  kind text not null check (kind in ('expense','settlement')),
  title text not null check (length(trim(title)) between 1 and 160),
  date date not null,
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  paid_by uuid not null references public.members(user_id),
  shares jsonb not null default '{}' check (jsonb_typeof(shares) = 'object'),
  recipient uuid references public.members(user_id),
  created_by uuid not null references public.members(user_id),
  created_at timestamptz not null default now(),
  check ((kind='expense' and recipient is null) or (kind='settlement' and recipient is not null and recipient<>paid_by and shares='{}'::jsonb))
);
create index on public.household_expenses(household_id, date desc);
alter table public.household_expenses enable row level security;
revoke all on public.household_expenses from public, anon, authenticated;

create function public.shared_expenses(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; actor_uid uuid; eid uuid; payer uuid; receiver uuid; cents integer; split_data jsonb;
  part record; total bigint := 0; row_data public.household_expenses;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  if operation='get' then
    return jsonb_build_object('expenses',(select coalesce(jsonb_agg(e order by e.date desc,e.created_at desc),'[]') from public.household_expenses e where household_id=hid));
  end if;
  actor_uid := nullif(payload->>'actor','')::uuid;
  if not exists(select 1 from public.members where household_id=hid and user_id=actor_uid and name<>'Housemates') then
    raise exception 'Choose a household member' using errcode='42501';
  end if;
  eid := (payload->>'id')::uuid;
  if eid is null then raise exception 'Expense ID required'; end if;
  if operation='delete' then
    delete from public.household_expenses where household_id=hid and id=eid;
    if not found then raise exception 'Expense not found'; end if;
    return jsonb_build_object('ok',true);
  end if;
  if operation not in ('create','update') then raise exception 'Unknown operation'; end if;
  if jsonb_typeof(payload->'amount_cents') is distinct from 'number' or (payload->>'amount_cents') !~ '^[0-9]+$' then raise exception 'Use whole cents'; end if;
  cents := (payload->>'amount_cents')::integer;
  payer := (payload->>'paid_by')::uuid;
  if not exists(select 1 from public.members where household_id=hid and user_id=payer and name<>'Housemates') then raise exception 'Invalid payer'; end if;
  split_data := coalesce(payload->'shares','{}');
  receiver := nullif(payload->>'recipient','')::uuid;
  if payload->>'kind'='expense' then
    if jsonb_typeof(split_data) is distinct from 'object' or split_data='{}'::jsonb then raise exception 'Choose a split'; end if;
    for part in select * from jsonb_each(split_data) loop
      if not exists(select 1 from public.members where household_id=hid and user_id=part.key::uuid and name<>'Housemates') then raise exception 'Invalid split member'; end if;
      if jsonb_typeof(part.value)<>'number' or part.value::text !~ '^[0-9]+$' then raise exception 'Invalid share'; end if;
      total := total + (part.value::text)::bigint;
    end loop;
    if total<>cents then raise exception 'Shares must add up to the total'; end if;
  elsif payload->>'kind'='settlement' then
    if not exists(select 1 from public.members where household_id=hid and user_id=receiver and name<>'Housemates') then raise exception 'Invalid recipient'; end if;
  else raise exception 'Invalid expense kind'; end if;
  if operation='create' then
    insert into public.household_expenses(id,household_id,kind,title,date,amount_cents,paid_by,shares,recipient,created_by)
      values(eid,hid,payload->>'kind',trim(payload->>'title'),(payload->>'date')::date,cents,payer,split_data,receiver,actor_uid)
      on conflict(id) do nothing returning * into row_data;
    if not found then
      select * into row_data from public.household_expenses where id=eid and household_id=hid and created_by=actor_uid;
      if not found or row_data.kind<>payload->>'kind' or row_data.title<>trim(payload->>'title') or row_data.date<>(payload->>'date')::date or row_data.amount_cents<>cents or row_data.paid_by<>payer or row_data.shares<>split_data or row_data.recipient is distinct from receiver then
        raise exception 'Expense ID already used';
      end if;
    end if;
  else
    update public.household_expenses set title=trim(payload->>'title'),date=(payload->>'date')::date,amount_cents=cents,paid_by=payer,shares=split_data,recipient=receiver
      where id=eid and household_id=hid and kind=payload->>'kind' returning * into row_data;
    if not found then raise exception 'Expense not found'; end if;
  end if;
  return jsonb_build_object('expense',to_jsonb(row_data));
end $$;
revoke all on function public.shared_expenses(text,text,jsonb) from public, authenticated;
grant execute on function public.shared_expenses(text,text,jsonb) to anon;
commit;
