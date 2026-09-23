begin;
create table public.house_shopping_purchases (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  actor uuid not null references public.members(user_id),
  quantity numeric not null check(quantity>0),
  amount_cents integer not null check(amount_cents>0),
  created_at timestamptz not null default now()
);
alter table public.house_shopping_purchases enable row level security;
revoke all on public.house_shopping_purchases from public,anon,authenticated;
alter function public.shared_shopping(text,text,jsonb) rename to shared_shopping_before_partial;
revoke all on function public.shared_shopping_before_partial(text,text,jsonb) from public,anon,authenticated;
create function public.shared_shopping(access_token text, operation text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; actor uuid; item public.entries; purchase_id uuid; bought numeric; cents integer; payers uuid[]; parts jsonb; previous public.house_shopping_purchases;
begin
  if operation<>'purchase_partial' then return public.shared_shopping_before_partial(access_token,operation,payload); end if;
  hid:=public.coordination_identity(access_token,payload->>'actor');
  actor:=(payload->>'actor')::uuid;
  purchase_id:=(payload->>'purchase_id')::uuid;
  bought:=(payload->>'quantity')::numeric;
  cents:=(payload->>'amount_cents')::integer;
  if bought<=0 or bought>100000 or cents<=0 or cents>100000000 then raise exception 'Enter a valid quantity and price'; end if;
  select * into previous from public.house_shopping_purchases where id=purchase_id;
  if found then
    if previous.household_id<>hid or previous.actor<>actor then raise exception 'Access denied' using errcode='42501'; end if;
    return jsonb_build_object('ok',true,'entry',(select to_jsonb(e) from public.entries e where id=previous.entry_id));
  end if;
  select * into item from public.entries where household_id=hid and id=(payload->>'id')::uuid for update;
  if not found or item.kind<>'request' or item.done then raise exception 'This shopping item is no longer open'; end if;
  if item.visibility='private' then raise exception 'Private shopping purchases cannot be added to the shared ledger'; end if;
  if bought>item.quantity then raise exception 'Quantity exceeds what remains'; end if;
  payers:=case when item.category='Personal' and item.assignee is not null then array[item.assignee] else array(select user_id from public.members where household_id=hid and active and name<>'Housemates' order by user_id) end;
  if cardinality(payers)=0 then raise exception 'No active housemates'; end if;
  select jsonb_object_agg(p::text,cents/cardinality(payers)+case when n<=cents%cardinality(payers) then 1 else 0 end) into parts from unnest(payers) with ordinality x(p,n);
  perform public.shared_expenses(access_token,'create',jsonb_build_object('actor',actor,'id',purchase_id,'kind','expense','title',item.title||' ('||bought::text||coalesce(' '||nullif(item.unit,''),'')||')',
    'date',public.household_today(hid),'amount_cents',cents,'paid_by',actor,'shares',parts,'category',case when item.category in ('Groceries','Utilities') then item.category else 'Shopping' end));
  update public.entries set quantity=case when quantity=bought then quantity else quantity-bought end,
    amount=case when quantity>bought and amount is not null then round(amount*(quantity-bought)/quantity,2) else amount end,
    done=(quantity=bought),completed_at=case when quantity=bought then now() else completed_at end where id=item.id;
  insert into public.house_shopping_purchases(id,household_id,entry_id,actor,quantity,amount_cents) values(purchase_id,hid,item.id,actor,bought,cents);
  return jsonb_build_object('ok',true,'entry',(select to_jsonb(e) from public.entries e where id=item.id));
end $$;
revoke all on function public.shared_shopping(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_shopping(text,text,jsonb) to anon;
commit;
