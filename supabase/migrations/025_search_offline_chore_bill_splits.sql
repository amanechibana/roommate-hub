-- Household search, durable offline shopping writes, chore history and bill shares.
begin;
create extension if not exists unaccent with schema extensions;
alter table public.entries add column bill_shares jsonb;
alter table public.entries add column last_done_at timestamptz;
alter table public.entries add column last_done_by uuid references public.members(user_id);
-- Completion timestamps already recorded by 021 are real; actor stays unknown.
update public.entries set last_done_at=completed_at where kind='task';
create function public.track_chore_completion() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='task' and new.done and not old.done then
   new.last_done_at:=clock_timestamp();
   new.last_done_by:=nullif(current_setting('common_ground.actor',true),'')::uuid;
 end if;
 return new;
end $$;
revoke all on function public.track_chore_completion() from public,anon,authenticated;
create trigger track_chore_completion before update of done on public.entries for each row execute function public.track_chore_completion();
create index entries_chore_history on public.entries(household_id,series_id,last_done_at desc) where kind='task' and last_done_at is not null;

-- The installed payment implementation remains authoritative; use saved shares
-- in the one place it calculates each original participant's cents.
do $$ declare fn record; definition text; found_payment boolean:=false; found_undo boolean:=false; begin
 for fn in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'shared_home%' loop
  definition:=pg_get_functiondef(fn.oid);
  if strpos(fn.prosrc,'share:=cents/cardinality(b.payment_members)')>0 then
   definition:=replace(definition,'share:=cents/cardinality(b.payment_members)+case when pos<cents%cardinality(b.payment_members) then 1 else 0 end;',
    'share:=coalesce((b.bill_shares->>m::text)::integer,cents/cardinality(b.payment_members)+case when pos<cents%cardinality(b.payment_members) then 1 else 0 end);');
   found_payment:=true;
  end if;
  if strpos(fn.prosrc,'payment_members=old.payment_members,paid_by=old.paid_by')>0 then
   definition:=replace(definition,'payment_members=old.payment_members,paid_by=old.paid_by',
    'payment_members=old.payment_members,paid_by=old.paid_by,bill_shares=old.bill_shares,last_done_at=old.last_done_at,last_done_by=old.last_done_by');
   found_undo:=true;
  end if;
  if definition<>pg_get_functiondef(fn.oid) then execute definition; end if;
 end loop;
 if not found_payment or not found_undo then raise exception 'Expected payment and undo implementations are missing'; end if;
end $$;
create function public.protect_bill_shares() returns trigger language plpgsql set search_path='' as $$
begin
 if new.bill_shares is distinct from old.bill_shares and exists(select 1 from public.bill_ledger_payments where bill_id=old.id) then
  raise exception 'Delete the linked bill expense before changing its split.';
 end if;
 return new;
end $$;
revoke all on function public.protect_bill_shares() from public,anon,authenticated;
create trigger protect_bill_shares before update of bill_shares on public.entries for each row execute function public.protect_bill_shares();
-- Validation sees the final row after legacy writes and custom shares land.
create function public.validate_bill_shares() returns trigger language plpgsql set search_path='' as $$
declare b public.entries; part record; total bigint:=0;
begin
 select * into b from public.entries where id=new.id;
 if not found or b.bill_shares is null then return null; end if;
 if b.kind<>'event' or b.category not in ('Rent','Bill') or b.amount is null or jsonb_typeof(b.bill_shares)<>'object'
 then raise exception 'Custom shares need a bill amount.'; end if;
 if (select count(*) from jsonb_object_keys(b.bill_shares))<>cardinality(b.payment_members) then raise exception 'Set a share for every bill participant.'; end if;
 for part in select * from jsonb_each(b.bill_shares) loop
  if not (part.key::uuid=any(b.payment_members)) or jsonb_typeof(part.value)<>'number' or part.value::text !~ '^[0-9]+$' then raise exception 'Shares must be whole, nonnegative cents for bill participants.'; end if;
  total:=total+(part.value::text)::bigint;
 end loop;
 if total<>round(b.amount*100)::bigint then raise exception 'Bill shares must add up to the total.'; end if;
 return null;
end $$;
revoke all on function public.validate_bill_shares() from public,anon,authenticated;
create constraint trigger validate_bill_shares after insert or update on public.entries deferrable initially deferred for each row execute function public.validate_bill_shares();

alter function public.shared_home(text,text,jsonb) rename to shared_home_before_search_offline;
revoke all on function public.shared_home_before_search_offline(text,text,jsonb) from public,anon,authenticated;
create function public.shared_home(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; result jsonb; ids uuid[]; before_rows jsonb; after_rows jsonb; target public.entries; actor uuid; shares jsonb; undo_id uuid;
begin
 hid:=public.coordination_identity(access_token,payload->>'actor');
 actor:=nullif(payload->>'actor','')::uuid;
 perform set_config('common_ground.actor',coalesce(actor::text,''),true);
 if operation='update' then
  select * into target from public.entries where household_id=hid and id=(payload->>'id')::uuid;
  ids:=array(select id from public.entries where household_id=hid and
    (id=target.id or (payload->>'scope'='series' and target.series_id is not null and series_id=target.series_id)) order by id);
  perform 1 from public.entries where id=any(ids) order by id for update;
  select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') into before_rows from public.entries e where id=any(ids);
 end if;
 result:=public.shared_home_before_search_offline(access_token,operation,case when operation='update' then payload-'bill_shares'-'undo_token' else payload-'bill_shares' end);
 if operation='create' then ids:=array(select (value->>'id')::uuid from jsonb_array_elements(result->'entries')); end if;
 if operation in ('create','update') then
  if payload ? 'bill_shares' then
   shares:=nullif(payload->'bill_shares','null'::jsonb);
   update public.entries set bill_shares=shares where household_id=hid and id=any(ids);
  end if;
  update public.entries set bill_shares=null where household_id=hid and id=any(ids) and (kind<>'event' or category not in ('Rent','Bill')) and bill_shares is not null;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.date,e.id),'[]') into after_rows from public.entries e where household_id=hid and id=any(ids);
  result:=result||jsonb_build_object('entries',after_rows);
  if operation='update' and payload ? 'undo_token' then
   undo_id:=(payload->>'undo_token')::uuid;
   delete from public.edit_undo_batches where expires_at<clock_timestamp();
   insert into public.edit_undo_batches(id,household_id,actor,surface,before_rows,after_rows)
    values(undo_id,hid,actor,'home',before_rows,(select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.entries e where id=any(ids)));
  end if;
 elsif operation in ('get','history') then
  result:=jsonb_set(result,'{entries}',coalesce((select jsonb_agg(value||case when value->>'kind'='task' then
    coalesce((select jsonb_build_object('last_done_at',e.last_done_at,'last_done_by',e.last_done_by) from public.entries e
      where e.household_id=hid and e.kind='task' and e.last_done_at is not null and
       (e.id=(value->>'id')::uuid or (nullif(value->>'series_id','') is not null and e.series_id=(value->>'series_id')::uuid))
      order by e.last_done_at desc,e.id limit 1),'{}'::jsonb) else '{}'::jsonb end)
    from jsonb_array_elements(result->'entries')),'[]'));
 end if;
 return result;
end $$;
revoke all on function public.shared_home(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_home(text,text,jsonb) to anon,authenticated;

create table public.offline_shopping_writes (
 id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
 actor uuid not null references public.members(user_id), result jsonb not null, created_at timestamptz not null default now()
);
alter table public.offline_shopping_writes enable row level security;
revoke all on public.offline_shopping_writes from public,anon,authenticated;
create function public.shared_shopping(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; actor uuid; b public.entries; receipt public.offline_shopping_writes; result jsonb; cents integer; parts jsonb; payers uuid[]; write_id uuid;
begin
 hid:=public.coordination_identity(access_token,payload->>'actor');
 actor:=nullif(payload->>'actor','')::uuid;
 if operation<>'sync' or actor is null then raise exception 'Choose a current household member.'; end if;
 if hid<>(payload->>'household_id')::uuid then raise exception 'This shopping list belongs to another household.'; end if;
 write_id:=(payload->>'write_id')::uuid;
 -- Membership row lock also serializes receipt checks, including response-loss retries.
 select * into receipt from public.offline_shopping_writes where id=write_id;
 if found then
  if receipt.household_id<>hid or receipt.actor<>actor then raise exception 'Access denied' using errcode='42501'; end if;
  return receipt.result;
 end if;
 select * into b from public.entries where household_id=hid and id=(payload->>'id')::uuid for update;
 if not found or b.kind<>'request' then result:=jsonb_build_object('conflict',true,'error','This item was removed.');
 elsif b.done is distinct from (payload->>'expected_done')::boolean or b.completed_at is distinct from nullif(payload->>'expected_completed_at','')::timestamptz
   or b.title is distinct from payload->>'expected_title' or b.amount is distinct from nullif(payload->>'expected_amount','')::numeric
   or b.category is distinct from payload->>'expected_category' or b.assignee is distinct from nullif(payload->>'expected_assignee','')::uuid then
  result:=jsonb_build_object('conflict',true,'error','This item changed while you were offline. Review it at home.','entry',to_jsonb(b));
 else
  if jsonb_typeof(payload->'done') is distinct from 'boolean' then raise exception 'Choose bought or open.'; end if;
  result:=public.shared_home(access_token,'update',jsonb_build_object('actor',actor,'id',b.id,'done',payload->'done'));
  if payload->>'done'='true' and not b.done and b.amount>0 and not exists(select 1 from public.household_expenses where id=b.id) then
   cents:=round(b.amount*100)::integer;
   payers:=case when b.category='Personal' and b.assignee is not null then array[b.assignee] else array(select user_id from public.members where household_id=hid and active and name<>'Housemates' order by user_id) end;
   select jsonb_object_agg(p::text,cents/cardinality(payers)+case when n<=cents%cardinality(payers) then 1 else 0 end) into parts from unnest(payers) with ordinality x(p,n);
   result:=result||public.shared_expenses(access_token,'create',jsonb_build_object('actor',actor,'id',b.id,'kind','expense','title',b.title,
    'date',(now() at time zone 'America/New_York')::date,'amount_cents',cents,'paid_by',actor,'shares',parts));
  end if;
  result:=jsonb_build_object('ok',true,'entry',(select to_jsonb(e) from public.entries e where id=b.id));
 end if;
 insert into public.offline_shopping_writes(id,household_id,actor,result) values(write_id,hid,actor,result);
 return result;
end $$;
revoke all on function public.shared_shopping(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_shopping(text,text,jsonb) to anon,authenticated;

create function public.shared_search(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; query text; skip integer; result jsonb;
begin
 hid:=public.coordination_identity(access_token,null);
 if operation<>'search' then raise exception 'Invalid search operation.'; end if;
 query:=trim(extensions.unaccent(lower(coalesce(payload->>'query',''))));
 skip:=coalesce((payload->>'offset')::integer,0);
 if length(query)<2 or length(query)>160 or skip<0 or skip>100000 then raise exception 'Enter 2–160 characters to search.'; end if;
 with records as (
  select 'entry:'||e.id as key,case e.kind when 'task' then 'To-dos' when 'request' then 'Shopping list' when 'note' then 'House notes' else 'Calendar' end as tab,
   e.title,e.description as detail,concat_ws(' ',e.title,e.description,e.category,e.date,e.amount,m.name) as text,to_jsonb(e) as entry
   from public.entries e left join public.members m on m.user_id=coalesce(e.assignee,e.created_by) and m.household_id=hid where e.household_id=hid
  union all select 'expense:'||e.id,'Expenses',e.title,concat_ws(' · ',e.date,(e.amount_cents/100.0)::text,'USD',m.name),concat_ws(' ',e.title,e.date,e.kind,m.name,e.amount_cents/100.0),null from public.household_expenses e left join public.members m on m.user_id=e.paid_by where e.household_id=hid
  union all select 'handbook:'||h.id,'House handbook',h.title,concat_ws(E'\n',h.value,h.notes),concat_ws(' ',h.title,h.section,h.value,h.notes,(select string_agg(f.file_name,' ') from public.house_handbook_files f where f.entry_id=h.id and f.household_id=hid)),null from public.house_handbook_entries h where h.household_id=hid
  union all select 'agreement:'||a.id,'Our household',a.title,a.terms::text,concat_ws(' ',a.title,a.status,a.terms),null from public.agreements a where household_id=hid
  union all select 'amendment:'||a.id,'Our household',a.title,a.body,concat_ws(' ',a.title,a.body,a.reason),null from public.agreement_amendments a where household_id=hid
  union all select 'poll:'||p.id,'Household life',p.title,concat_ws(' · ',p.options::text,p.decision),concat_ws(' ',p.title,p.options,p.decision),null from public.house_polls p where household_id=hid
  union all select 'pantry:'||p.id,'Household life',p.title,concat_ws(' · ',p.status,p.notes),concat_ws(' ',p.title,p.status,p.notes),null from public.house_pantry p where household_id=hid
  union all select 'repair:'||r.id,'Household life',r.title,concat_ws(E'\n',r.description,r.status,r.resolution),concat_ws(' ',r.title,r.description,r.status,r.resolution),null from public.house_maintenance r where household_id=hid
  union all select 'meal:'||m.id,'Household life',m.title,concat_ws(E'\n',m.date,m.notes,m.ingredients::text),concat_ws(' ',m.title,m.date,m.notes,m.ingredients),null from public.house_meals m where household_id=hid
  union all select 'decision:'||d.id,'House planning',d.title,case when d.done then 'Done' else 'Open decision' end,d.title,null from public.house_decisions d where household_id=hid
  union all select 'review:'||c.week,'House planning','Weekly review '||c.week,c.notes,concat_ws(' ',c.week,c.notes),null from public.house_checkins c where household_id=hid
  union all select 'booking:'||b.id,'House planning',r.name,concat_ws(' · ',b.starts_at,b.ends_at,b.notes),concat_ws(' ',r.name,b.notes,b.starts_at,b.ends_at),null from public.house_bookings b join public.house_resources r on r.id=b.resource_id where b.household_id=hid
  union all select 'move:'||m.id,'House planning',case m.direction when 'in' then 'Move-in checklist' else 'Move-out checklist' end,concat_ws(E'\n',m.date,m.items::text),concat_ws(' ',m.direction,m.date,m.items),null from public.house_moves m where household_id=hid
  union all select 'archive:'||a.id,'House planning',a.agreement->>'title',(a.agreement->'terms')::text,a.agreement::text,null from public.house_membership_agreement_archive a where household_id=hid
 ), matched as (
  select * from records r where not exists(select 1 from regexp_split_to_table(query,'\s+') word where strpos(extensions.unaccent(lower(r.text)),word)=0)
 ), page as (select * from matched order by lower(title),key offset skip limit 51)
 select jsonb_build_object('results',coalesce((select jsonb_agg(jsonb_build_object('key',key,'tab',tab,'title',title,'detail',left(detail,4000),'entry',entry) order by lower(title),key) from (select * from page order by lower(title),key limit 50) visible),'[]'),
   'next_offset',case when (select count(*) from page)>50 then skip+50 else null end) into result;
 return result;
end $$;
revoke all on function public.shared_search(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_search(text,text,jsonb) to anon,authenticated;
-- Keep the currently reported schema aligned with this migration.
do $$ declare fn record; definition text; begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'shared_household_ops%' and p.prosrc like '%schema_version%' loop
  definition:=replace(pg_get_functiondef(fn.oid),'''024''','''025'''); execute definition;
 end loop;
end $$;
commit;
