begin;
alter table public.entries add column quantity numeric not null default 1 check (quantity>0 and quantity<=100000),
  add column unit text not null default '' check(char_length(unit)<=40),
  add column store text not null default '' check(char_length(store)<=100),
  add column checklist jsonb not null default '[]' check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist)<=50 and pg_column_size(checklist)<16000),
  add column effort_minutes integer check(effort_minutes between 1 and 1440),
  add column visibility text not null default 'household' check(visibility in ('household','private'));
alter table public.household_expenses add column category text not null default 'Other' check(char_length(category) between 1 and 60),
  add column percentages jsonb check(percentages is null or jsonb_typeof(percentages)='object');
create table public.household_preferences(household_id uuid primary key references public.households(id) on delete cascade, settings jsonb not null default '{}');
create table public.member_reminders(household_id uuid references public.households(id) on delete cascade, member uuid not null, settings jsonb not null, primary key(household_id,member));
create table public.chore_coverage(id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 entry_id uuid not null references public.entries(id) on delete cascade, original uuid not null, candidate uuid not null, requester uuid not null, date date not null,
 status text not null default 'open' check(status in ('open','approved','declined')), created_at timestamptz not null default clock_timestamp());
create unique index one_open_coverage on public.chore_coverage(entry_id) where status='open';
create table public.expense_receipts(id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 expense_id uuid not null references public.household_expenses(id) on delete cascade, storage_path text not null unique, file_name text not null check(char_length(file_name) between 1 and 180),
 content_type text not null check(content_type in ('application/pdf','image/jpeg','image/png','image/webp')), size_bytes integer not null check(size_bytes between 1 and 10485760));
create table public.mutation_receipts(household_id uuid not null references public.households(id) on delete cascade, actor uuid not null, id uuid not null,
 surface text not null, operation text not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp(), primary key(household_id,actor,id,surface));
create table public.custom_digest_deliveries(household_id uuid not null references public.households(id) on delete cascade, endpoint_hash text not null,
 edition text not null, date date not null, status text not null default 'sending', claimed_at timestamptz not null default clock_timestamp(), finished_at timestamptz, attempts integer not null default 1, primary key(household_id,endpoint_hash,edition,date));
alter table public.household_preferences enable row level security;
alter table public.member_reminders enable row level security;
alter table public.chore_coverage enable row level security;
alter table public.expense_receipts enable row level security;
alter table public.mutation_receipts enable row level security;
alter table public.custom_digest_deliveries enable row level security;
revoke all on public.household_preferences,public.member_reminders,public.chore_coverage,public.expense_receipts,public.mutation_receipts,public.custom_digest_deliveries from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('expense-receipts','expense-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']);

-- Private actions never enter the shared activity feed.
create function public.suppress_private_activity() returns trigger language plpgsql set search_path='' as $$
begin if current_setting('app.private_action',true)='true' then return null; end if; return new; end $$;
create trigger suppress_private_activity before insert on public.house_activity for each row execute function public.suppress_private_activity();

alter function public.shared_home(text,text,jsonb) rename to shared_home_before_improvements;
revoke all on function public.shared_home_before_improvements(text,text,jsonb) from public,anon,authenticated;
create function public.shared_home(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
<<ctx>>
declare hid uuid; actor uuid:=nullif(payload->>'actor','')::uuid; today date; first_day date; last_day date; cursor_row public.entries;
 result jsonb; rows jsonb; more boolean; n integer; b public.entries; item jsonb; old_rows jsonb; ids uuid[]; mutation uuid:=nullif(payload->>'mutation_id','')::uuid; saved public.mutation_receipts; private_action boolean:=false; titles text[]; title text; copy_id uuid;
begin
 hid:=public.coordination_identity(access_token,payload->>'actor');
 today:=(now() at time zone coalesce((select settings->>'timezone' from public.household_preferences where household_id=hid),'America/New_York'))::date;
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
      select e.* from public.entries e where e.household_id=hid and (e.visibility='household' or e.created_by=actor)
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
        'preferences',coalesce((select settings from public.household_preferences where household_id=hid),'{}'::jsonb),
        'members',(select coalesce(jsonb_agg(person order by person.name),'[]') from public.members person where person.household_id=hid and person.active),
        'former_members',(select coalesce(jsonb_agg(person order by person.name),'[]') from public.members person where person.household_id=hid and not person.active),
        'activity',(select coalesce(jsonb_agg(to_jsonb(a)-'household_id' order by a.created_at desc,a.id),'[]')
          from (select * from public.house_activity where household_id=hid order by created_at desc,id desc limit 20) a)
      );
    end if;
    return result;
 end if;
 if operation in ('attempt','attempt_clear') then return public.shared_home_before_improvements(access_token,operation,payload); end if;
 if not exists(select 1 from public.members where household_id=hid and user_id=actor and active and name<>'Housemates') then raise exception 'Choose a household member'; end if;
 if mutation is not null then
   perform pg_advisory_xact_lock(hashtextextended(hid::text||actor::text||mutation::text||'home',0));
   select * into saved from public.mutation_receipts where household_id=hid and mutation_receipts.actor=ctx.actor and id=mutation and surface='home';
   if found then
     if saved.operation<>operation or saved.payload<>payload then raise exception 'Mutation ID already used'; end if;
     return saved.result;
   end if;
 end if;
 if operation in ('update','delete','payment','split_shopping') then
   select * into b from public.entries where household_id=hid and id=(payload->>'id')::uuid for update;
   if b.visibility='private' and b.created_by<>actor then raise exception 'This item is private'; end if;
   if payload->>'scope'='series' and exists(select 1 from public.entries where household_id=hid and series_id=b.series_id and visibility='private' and created_by<>actor) then raise exception 'This series contains private items'; end if;
   private_action:=b.visibility='private';
 end if;
 if payload ? 'visibility' then
   if payload->>'visibility' not in ('private','household') then raise exception 'Invalid visibility'; end if;
   if payload->>'visibility'='private' and (coalesce(payload->>'category',b.category)<>'Personal' or coalesce(payload->>'kind',b.kind) not in ('task','request') or (b.id is not null and b.created_by<>actor)) then raise exception 'Only your own personal to-dos and shopping items can be private'; end if;
   private_action:=private_action or payload->>'visibility'='private';
 end if;
 if b.visibility='private' and coalesce(payload->>'category',b.category)<>'Personal' and coalesce(payload->>'visibility',b.visibility)<>'household' then raise exception 'Choose household visibility before sharing this item'; end if;
 if payload ? 'checklist' then
   if jsonb_typeof(payload->'checklist') is distinct from 'array' then raise exception 'Invalid checklist'; end if;
   for item in select value from jsonb_array_elements(payload->'checklist') loop
     if jsonb_typeof(item) is distinct from 'object' or coalesce(char_length(trim(item->>'title')),0) not between 1 and 160 or jsonb_typeof(item->'done') is distinct from 'boolean' or coalesce(char_length(item->>'id'),0) not between 1 and 64 then raise exception 'Each checklist step needs a title, ID and completion check'; end if;
   end loop;
   if (select count(*) from jsonb_array_elements(payload->'checklist'))<>(select count(distinct value->>'id') from jsonb_array_elements(payload->'checklist')) then raise exception 'Checklist IDs must be unique'; end if;
 end if;
 if operation='split_shopping' then
   if b.id is null or b.kind<>'request' or b.done or strpos(b.title,':')<2 then raise exception 'Choose an unfinished bundled shopping entry'; end if;
   titles:=array(select trim(t) from unnest(string_to_array(substr(b.title,strpos(b.title,':')+1),',')) t where trim(t)<>'');
   if cardinality(titles) not between 2 and 50 or jsonb_typeof(payload->'client_ids') is distinct from 'array' or jsonb_array_length(payload->'client_ids')<>cardinality(titles) then raise exception 'Choose 2 to 50 separate items'; end if;
   rows:='[]';
   for n in 1..cardinality(titles) loop
     copy_id:=(payload->'client_ids'->>(n-1))::uuid;
     insert into public.entries(id,household_id,created_by,kind,title,description,category,date,assignee,url,quantity,unit,store,visibility)
     values(copy_id,hid,actor,'request',titles[n],case when char_length(split_part(b.title,':',1)||' · '||b.description)<=2000 then split_part(b.title,':',1)||case when b.description<>'' then ' · '||b.description else '' end else b.description end,b.category,b.date,b.assignee,b.url,1,b.unit,b.store,b.visibility);
     rows:=rows||jsonb_build_array((select to_jsonb(e) from public.entries e where id=copy_id));
   end loop;
   delete from public.entries where id=b.id and household_id=hid;
   result:=jsonb_build_object('ok',true,'entries',rows);
   if mutation is not null then insert into public.mutation_receipts(household_id,actor,id,surface,operation,payload,result) values(hid,actor,mutation,'home',operation,payload,result); end if;
   return result;
 end if;
 if operation='undo_edit' then
   select before_rows into old_rows from public.edit_undo_batches where id=(payload->>'undo_token')::uuid and household_id=hid and edit_undo_batches.actor=ctx.actor and surface='home';
 end if;
 perform set_config('app.private_action',private_action::text,true);
 result:=public.shared_home_before_improvements(access_token,operation,payload);
 perform set_config('app.private_action','false',true);
 if operation='create' then
   ids:=array(select (value->>'id')::uuid from jsonb_array_elements(result->'entries'));
   if payload ? 'client_ids' then
     if jsonb_array_length(payload->'client_ids')<>cardinality(ids) then raise exception 'Invalid client IDs'; end if;
     for n in 1..cardinality(ids) loop
       update public.entries set id=(payload->'client_ids'->>(n-1))::uuid where household_id=hid and id=ids[n];
       ids[n]:=(payload->'client_ids'->>(n-1))::uuid;
     end loop;
   end if;
 elsif operation='update' then
   ids:=array(select id from public.entries where household_id=hid and (id=b.id or (payload->>'scope'='series' and b.series_id is not null and series_id=b.series_id)));
 end if;
 if operation in ('create','update') then
   update public.entries e set quantity=case when payload ? 'quantity' then (payload->>'quantity')::numeric else e.quantity end,
    unit=case when payload ? 'unit' then trim(payload->>'unit') else e.unit end,
    store=case when payload ? 'store' then trim(payload->>'store') else e.store end,
    checklist=case when payload ? 'checklist' then case when operation='create' then (select coalesce(jsonb_agg(value||jsonb_build_object('done',false)),'[]') from jsonb_array_elements(payload->'checklist')) when e.id<>b.id then (select coalesce(jsonb_agg(step||jsonb_build_object('done',coalesce((select (old->>'done')::boolean from jsonb_array_elements(e.checklist) old where old->>'id'=step->>'id'),false))),'[]') from jsonb_array_elements(payload->'checklist') step) else payload->'checklist' end else e.checklist end,
    effort_minutes=case when payload ? 'effort_minutes' then nullif(payload->>'effort_minutes','')::integer else e.effort_minutes end,
    visibility=case when payload ? 'visibility' then payload->>'visibility' else e.visibility end
    where household_id=hid and id=any(ids);
   result:=jsonb_set(result,'{entries}',(select coalesce(jsonb_agg(to_jsonb(e) order by array_position(ids,e.id)),'[]') from public.entries e where household_id=hid and id=any(ids)));
   if operation='update' and payload ? 'undo_token' then
     update public.edit_undo_batches set after_rows=(select jsonb_agg(to_jsonb(e) order by e.id) from public.entries e where household_id=hid and id=any(ids)) where id=(payload->>'undo_token')::uuid and household_id=hid and edit_undo_batches.actor=ctx.actor;
   end if;
 elsif operation='undo_edit' and old_rows is not null then
   update public.entries e set quantity=o.quantity,unit=o.unit,store=o.store,checklist=o.checklist,effort_minutes=o.effort_minutes,visibility=o.visibility
    from jsonb_populate_recordset(null::public.entries,old_rows) o where e.household_id=hid and e.id=o.id;
   result:=result||jsonb_build_object('restored',old_rows);
 end if;
 -- Legacy mutation replies can include a snapshot: strip private rows for other people.
 for item in select to_jsonb(x) from unnest(array['entries','restored']) x loop
   if result ? (item #>> '{}') then result:=jsonb_set(result,array[item #>> '{}'],(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(result->(item #>> '{}')) where coalesce(value->>'visibility','household')<>'private' or value->>'created_by'=actor::text)); end if;
 end loop;
 if private_action then result:=jsonb_set(result,'{activity}',(select coalesce(jsonb_agg(to_jsonb(a)-'household_id' order by a.created_at desc,a.id),'[]') from (select * from public.house_activity where household_id=hid order by created_at desc,id desc limit 20) a)); end if;
 if mutation is not null then insert into public.mutation_receipts(household_id,actor,id,surface,operation,payload,result) values(hid,actor,mutation,'home',operation,payload,result); end if;
 return result;
end $$;
revoke all on function public.shared_home(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_home(text,text,jsonb) to anon;

alter function public.shared_expenses(text,text,jsonb) rename to shared_expenses_before_improvements;
revoke all on function public.shared_expenses_before_improvements(text,text,jsonb) from public,anon,authenticated;
create function public.shared_expenses(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
<<ctx>>
declare hid uuid; actor uuid:=nullif(payload->>'actor','')::uuid; result jsonb; cursor_row public.household_expenses; rows jsonb; more boolean;
 mutation uuid:=nullif(payload->>'mutation_id','')::uuid; saved public.mutation_receipts; old_rows jsonb; percentages jsonb; part record; total numeric:=0; cents integer; expected jsonb;
begin
 hid:=public.coordination_identity(access_token,payload->>'actor');
 if operation='get' then
   if payload->>'id' is not null then return jsonb_build_object('expense',(select to_jsonb(e)||jsonb_build_object('receipts',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'file_name',r.file_name)),'[]') from public.expense_receipts r where r.expense_id=e.id)) from public.household_expenses e where household_id=hid and id=(payload->>'id')::uuid)); end if;
   if payload->>'cursor' is not null then
     select * into cursor_row from public.household_expenses where household_id=hid and id=(payload->>'cursor')::uuid;
     if not found then raise exception 'History cursor expired. Refresh and try again.'; end if;
   end if;
   with page as materialized(select e.* from public.household_expenses e where household_id=hid
     and (cursor_row.id is null or (e.date,e.created_at,e.id)<(cursor_row.date,cursor_row.created_at,cursor_row.id)) order by date desc,created_at desc,id desc limit 51),
   visible as(select * from page order by date desc,created_at desc,id desc limit 50)
   select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('receipts',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'file_name',r.file_name)),'[]') from public.expense_receipts r where r.expense_id=e.id)) order by e.date desc,e.created_at desc,e.id desc),'[]'),(select count(*)>50 from page) into rows,more from visible e;
   return jsonb_build_object('expenses',rows,'next_cursor',case when more then rows->49->>'id' else null end,
    'balances',(select coalesce(jsonb_object_agg(member,balance),'{}') from (select member,sum(amount) balance from (
       select paid_by::text member,amount_cents::bigint amount from public.household_expenses where household_id=hid
       union all select recipient::text,-amount_cents::bigint from public.household_expenses where household_id=hid and kind='settlement'
       union all select s.key,-(s.value::text)::bigint from public.household_expenses e cross join lateral jsonb_each(e.shares) s where household_id=hid and kind='expense'
    ) movements group by member) b),
    'summaries',(select coalesce(jsonb_agg(jsonb_build_object('month',totals.period,'category',category,'paid_by',paid_by,'amount_cents',amount)),'[]') from
      (select to_char(date,'YYYY-MM') as period,category,paid_by,sum(amount_cents) amount from public.household_expenses where household_id=hid and kind='expense' group by 1,2,3) totals));
 end if;
 if not exists(select 1 from public.members where household_id=hid and user_id=actor and active and name<>'Housemates') then raise exception 'Choose a household member'; end if;
 if mutation is not null then
   perform pg_advisory_xact_lock(hashtextextended(hid::text||actor::text||mutation::text||'expenses',0));
   select * into saved from public.mutation_receipts where household_id=hid and mutation_receipts.actor=ctx.actor and id=mutation and surface='expenses';
   if found then if saved.operation<>operation or saved.payload<>payload then raise exception 'Mutation ID already used'; end if; return saved.result; end if;
 end if;
 if payload ? 'percentages' and payload->'percentages'<>'null'::jsonb then
   percentages:=payload->'percentages';
   if jsonb_typeof(percentages)<>'object' or percentages='{}'::jsonb then raise exception 'Choose percentages'; end if;
   for part in select * from jsonb_each_text(percentages) loop
     if part.value !~ '^[0-9]+(\.[0-9]{1,2})?$' or part.value::numeric>100 then raise exception 'Use percentages from 0 to 100 with up to two decimals'; end if;
     total:=total+part.value::numeric;
   end loop;
   if total<>100 then raise exception 'Percentages must add up to 100'; end if;
   cents:=(payload->>'amount_cents')::integer;
   with weights as(select key,value::numeric*100 weight from jsonb_each_text(percentages)),
   base as(select key,floor(cents*weight/10000)::integer share,mod(cents*weight,10000) fraction from weights),
   ranked as(select *,row_number() over(order by fraction desc,key) rank from base)
   select jsonb_object_agg(key,share+case when rank<=cents-(select sum(share) from base) then 1 else 0 end) into expected from ranked;
   if expected is distinct from payload->'shares' then raise exception 'Shares do not match these percentages'; end if;
 end if;
 if operation='undo_edit' then select before_rows into old_rows from public.edit_undo_batches where household_id=hid and id=(payload->>'undo_token')::uuid and edit_undo_batches.actor=ctx.actor and surface='expenses'; end if;
 result:=public.shared_expenses_before_improvements(access_token,operation,payload);
 if operation in ('create','update') then
   update public.household_expenses e set category=case when payload ? 'category' then trim(payload->>'category') else e.category end,
     percentages=case when payload ? 'percentages' then nullif(payload->'percentages','null'::jsonb) else e.percentages end where household_id=hid and id=(payload->>'id')::uuid;
   result:=jsonb_set(result,'{expense}',(select to_jsonb(e) from public.household_expenses e where household_id=hid and id=(payload->>'id')::uuid));
   if payload ? 'undo_token' then update public.edit_undo_batches set after_rows=(select jsonb_agg(to_jsonb(e) order by e.id) from public.household_expenses e where household_id=hid and id=(payload->>'id')::uuid) where household_id=hid and id=(payload->>'undo_token')::uuid and edit_undo_batches.actor=ctx.actor; end if;
 elsif operation='undo_edit' and old_rows is not null then
   update public.household_expenses e set category=o.category,percentages=o.percentages from jsonb_populate_recordset(null::public.household_expenses,old_rows) o where e.household_id=hid and e.id=o.id;
   result:=result||jsonb_build_object('restored',old_rows);
 end if;
 if mutation is not null then insert into public.mutation_receipts(household_id,actor,id,surface,operation,payload,result) values(hid,actor,mutation,'expenses',operation,payload,result); end if;
 return result;
end $$;
revoke all on function public.shared_expenses(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_expenses(text,text,jsonb) to anon;

alter function public.shared_agreements(text,text,jsonb) rename to shared_agreements_before_pagination;
revoke all on function public.shared_agreements_before_pagination(text,text,jsonb) from public,anon,authenticated;
create function public.shared_agreements(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
<<ctx>>
declare hid uuid; result jsonb; rows jsonb; more boolean; cursor_row public.agreement_events;
begin
 hid:=public.coordination_identity(access_token,payload->>'actor');
 if operation not in ('get','history') then
   if exists(select 1 from public.entries e where e.household_id=hid and e.visibility='private' and (e.id::text=payload->>'entry_id' or e.id::text in(select jsonb_array_elements_text(coalesce(payload->'details'->'entry_ids','[]'))))) then raise exception 'Private items cannot be included in shared agreements'; end if;
   return public.shared_agreements_before_pagination(access_token,operation,payload);
 end if;
 if operation='get' then result:=public.shared_agreements_before_pagination(access_token,operation,payload); else result:='{}'; end if;
 if payload->>'cursor' is not null then
   select * into cursor_row from public.agreement_events where household_id=hid and id=(payload->>'cursor')::uuid;
   if not found then raise exception 'History cursor expired. Refresh and try again.'; end if;
 end if;
 with page as materialized(select * from public.agreement_events where household_id=hid and (cursor_row.id is null or (created_at,id)<(cursor_row.created_at,cursor_row.id)) order by created_at desc,id desc limit 51),
 visible as(select * from page order by created_at desc,id desc limit 50)
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc),'[]'),(select count(*)>50 from page) into rows,more from visible e;
 return result||jsonb_build_object('events',rows,'next_cursor',case when more then rows->49->>'id' else null end,
 'open_events',(select coalesce(jsonb_agg(e order by e.created_at desc,e.id desc),'[]') from public.agreement_events e where household_id=hid and status='open'));
end $$;
revoke all on function public.shared_agreements(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_agreements(text,text,jsonb) to anon;

create function public.shared_improvements(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
<<ctx>>
declare hid uuid; actor uuid:=nullif(payload->>'actor','')::uuid; settings jsonb; item jsonb; row_data public.chore_coverage; e public.entries; candidate uuid;
 file_data public.expense_receipts; timezone text; edition text; day date; endpoint_hash text; query text; results jsonb;
begin
 hid:=public.coordination_identity(access_token,payload->>'actor');
 if operation='get' then return jsonb_build_object('household',coalesce((select p.settings from public.household_preferences p where household_id=hid),'{}'),
 'reminders',coalesce((select r.settings from public.member_reminders r where household_id=hid and member=actor),'{}'),
 'coverage',(select coalesce(jsonb_agg(c order by c.created_at desc),'[]') from public.chore_coverage c where household_id=hid and (status='open' or created_at>now()-interval '30 days'))); end if;
 -- These two operations are server-only: the HTTP API never exposes them.
 if operation='reminder_roster' then return jsonb_build_object('household',coalesce((select p.settings from public.household_preferences p where household_id=hid),'{}'),
 'members',(select coalesce(jsonb_object_agg(member,r.settings),'{}') from public.member_reminders r where household_id=hid)); end if;
 if operation in ('claim_delivery','finish_delivery') then
   edition:=payload->>'edition'; day:=(payload->>'date')::date; endpoint_hash:=payload->>'endpoint_hash';
   if edition not in ('morning','evening') or endpoint_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid delivery'; end if;
   if operation='finish_delivery' then update public.custom_digest_deliveries set status=case when payload->>'status'='sent' then 'sent' else 'failed' end,finished_at=clock_timestamp() where household_id=hid and custom_digest_deliveries.edition=ctx.edition and date=day and custom_digest_deliveries.endpoint_hash=ctx.endpoint_hash; return '{}'; end if;
   if payload->>'retry'='true' and not exists(select 1 from public.custom_digest_deliveries d where d.household_id=hid and d.endpoint_hash=ctx.endpoint_hash and d.edition=ctx.edition and d.date=day) then return jsonb_build_object('claimed',false); end if;
   insert into public.custom_digest_deliveries(household_id,endpoint_hash,edition,date) values(hid,endpoint_hash,edition,day)
     on conflict on constraint custom_digest_deliveries_pkey do update set status='sending',claimed_at=clock_timestamp(),finished_at=null,attempts=custom_digest_deliveries.attempts+1
       where custom_digest_deliveries.status='failed' or (custom_digest_deliveries.status='sending' and custom_digest_deliveries.claimed_at<clock_timestamp()-interval '5 minutes');
   return jsonb_build_object('claimed',found);
 end if;
 if operation='search' then
   query:=trim(payload->>'query');
   if char_length(query) not between 2 and 160 then raise exception 'Search with 2 to 160 characters'; end if;
   with records as(
     select id::text id,kind type,title,concat_ws(' ',description,category,store,unit,checklist::text) detail,case kind when 'task' then 'To-dos' when 'request' then 'Shopping list' when 'note' then 'House notes' else 'Calendar' end tab from public.entries where household_id=hid and (visibility='household' or created_by=actor)
     union all select id::text,'expense',title,concat_ws(' ',category,date::text,amount_cents::text),'Expenses' from public.household_expenses where household_id=hid
     union all select h.id::text,'handbook',h.title,concat_ws(' ',h.value,h.notes,h.section,(select string_agg(file_name,' ') from public.house_handbook_files f where f.entry_id=h.id)),'House handbook' from public.house_handbook_entries h where household_id=hid
   ) select coalesce(jsonb_agg(r),'[]') into results from (select * from records where not exists(select 1 from regexp_split_to_table(lower(query),'\s+') word where strpos(lower(title||' '||detail),word)=0) order by title,id limit 51) r;
   return jsonb_build_object('results',results);
 end if;
 if operation='entry' then select * into e from public.entries where household_id=hid and id=(payload->>'id')::uuid and (visibility='household' or created_by=actor); if not found then raise exception 'Entry not found'; end if; return jsonb_build_object('entry',to_jsonb(e)); end if;
 if operation='receipt_file' then select * into file_data from public.expense_receipts where household_id=hid and id=(payload->>'id')::uuid; if not found then raise exception 'Receipt not found'; end if; return jsonb_build_object('file',to_jsonb(file_data)); end if;
 if not exists(select 1 from public.members where household_id=hid and user_id=actor and active and name<>'Housemates') then raise exception 'Choose a household member'; end if;
 if operation in ('save_household','save_reminders') then
   settings:=payload->'settings';
   if jsonb_typeof(settings) is distinct from 'object' or pg_column_size(settings)>24000 then raise exception 'Invalid settings'; end if;
   if operation='save_household' then
     timezone:=settings->>'timezone';
     if not exists(select 1 from pg_timezone_names where name=timezone) then raise exception 'Choose a valid household timezone'; end if;
     if coalesce(settings->>'quiet_start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(settings->>'quiet_end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose quiet-hour times'; end if;
     if jsonb_typeof(settings->'templates') is distinct from 'array' or jsonb_array_length(settings->'templates')>30 then raise exception 'Keep at most 30 templates'; end if;
     for item in select value from jsonb_array_elements(settings->'templates') loop
       if coalesce(char_length(item->>'id'),0) not between 1 and 64 or coalesce(char_length(trim(item->>'title')),0) not between 1 and 160 or jsonb_typeof(item->'steps') is distinct from 'array' or jsonb_array_length(item->'steps') not between 1 and 50 or coalesce(item->>'effort_minutes','') !~ '^[0-9]+$' or coalesce((item->>'effort_minutes')::integer,0) not between 1 and 1440 then raise exception 'Invalid chore template'; end if;
       if exists(select 1 from jsonb_array_elements(item->'steps') s where jsonb_typeof(s)<>'string' or char_length(s #>> '{}') not between 1 and 160) then raise exception 'Invalid template step'; end if;
     end loop;
     insert into public.household_preferences values(hid,settings) on conflict(household_id) do update set settings=excluded.settings;
   else
     for item in select to_jsonb(x) from unnest(array['morning','evening']) x loop
       if settings->(item #>> '{}') is distinct from 'null'::jsonb and coalesce(settings->>(item #>> '{}'),'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Choose a reminder time or disable it'; end if;
     end loop;
     if jsonb_typeof(settings->'topics') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(settings->'topics') t where t not in ('chores','plans','bills','shopping','expenses','notes','agreements','nudges')) then raise exception 'Choose notification types'; end if;
     insert into public.member_reminders values(hid,actor,settings) on conflict(household_id,member) do update set settings=excluded.settings;
   end if;
   return jsonb_build_object('ok',true);
 elsif operation='request_coverage' then
   select * into e from public.entries where household_id=hid and id=(payload->>'entry_id')::uuid for update;
   candidate:=(payload->>'candidate')::uuid;
   if e.kind<>'task' or e.done or e.category='Personal' or e.assignee is null or e.date is null or actor not in (e.assignee,candidate) or candidate=e.assignee or not exists(select 1 from public.members where household_id=hid and user_id=candidate and active and name<>'Housemates') then raise exception 'Choose an assigned household chore and a different housemate'; end if;
   if not exists(select 1 from public.entries where household_id=hid and kind='event' and category='Away' and date=e.date and assignee=e.assignee) then raise exception 'That housemate is no longer away on this date'; end if;
   if exists(select 1 from public.entries where household_id=hid and kind='event' and category='Away' and date=e.date and assignee=candidate) then raise exception 'The covering housemate is also away'; end if;
   insert into public.chore_coverage(household_id,entry_id,original,candidate,requester,date) values(hid,e.id,e.assignee,candidate,actor,e.date) returning * into row_data;
   return jsonb_build_object('coverage',to_jsonb(row_data));
 elsif operation='decide_coverage' then
   select * into row_data from public.chore_coverage where household_id=hid and id=(payload->>'id')::uuid for update;
   if not found or row_data.status<>'open' or actor=row_data.requester or actor not in(row_data.original,row_data.candidate) or jsonb_typeof(payload->'approve') is distinct from 'boolean' then raise exception 'The other involved housemate must approve this request'; end if;
   if (payload->>'approve')::boolean then
     select * into e from public.entries where household_id=hid and id=row_data.entry_id for update;
     if e.assignee is distinct from row_data.original or e.date is distinct from row_data.date or e.done or not exists(select 1 from public.members where household_id=hid and user_id=row_data.candidate and active and name<>'Housemates') or not exists(select 1 from public.entries where household_id=hid and kind='event' and category='Away' and date=e.date and assignee=e.assignee) or exists(select 1 from public.entries where household_id=hid and kind='event' and category='Away' and date=e.date and assignee=row_data.candidate) then raise exception 'The chore or availability changed. Review a new coverage request'; end if;
     update public.entries set assignee=row_data.candidate where id=e.id;
   end if;
   update public.chore_coverage set status=case when (payload->>'approve')::boolean then 'approved' else 'declined' end where id=row_data.id returning * into row_data;
   return jsonb_build_object('coverage',to_jsonb(row_data));
 elsif operation='attach_receipt' then
   if not exists(select 1 from public.household_expenses where household_id=hid and id=(payload->>'expense_id')::uuid and kind='expense') then raise exception 'Save a purchase before attaching its receipt'; end if;
   if (select count(*) from public.expense_receipts where expense_id=(payload->>'expense_id')::uuid)>=10 then raise exception 'Keep at most ten receipts per expense'; end if;
   if payload->>'storage_path' not like hid::text||'/'||(payload->>'expense_id')||'/%' then raise exception 'Invalid receipt path'; end if;
   insert into public.expense_receipts(household_id,expense_id,storage_path,file_name,content_type,size_bytes) values(hid,(payload->>'expense_id')::uuid,payload->>'storage_path',payload->>'file_name',payload->>'content_type',(payload->>'size_bytes')::integer) returning * into file_data;
   return jsonb_build_object('file',to_jsonb(file_data));
 elsif operation='remove_receipt' then
   delete from public.expense_receipts where household_id=hid and id=(payload->>'id')::uuid returning * into file_data;
   if not found then raise exception 'Receipt not found'; end if; return jsonb_build_object('file',to_jsonb(file_data));
 end if;
 raise exception 'Unknown operation';
end $$;
revoke all on function public.shared_improvements(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_improvements(text,text,jsonb) to anon;

alter function public.shared_household_ops(text,text,jsonb) rename to shared_household_ops_before_preferences;
revoke all on function public.shared_household_ops_before_preferences(text,text,jsonb) from public,anon,authenticated;
create function public.shared_household_ops(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; result jsonb;
begin
 result:=public.shared_household_ops_before_preferences(access_token,operation,payload);
 if operation='status' then
   select household_id into hid from public.shared_home_config where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
   result:=result||jsonb_build_object('schema_version','025','timezone',coalesce((select settings->>'timezone' from public.household_preferences where household_id=hid),'America/New_York'),
    'custom_reminders',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (
      select d.edition,d.date,case when bool_or(d.status='sending') then 'sending' when bool_or(d.status='failed') then case when bool_or(d.status='sent') then 'partial' else 'failed' end else 'sent' end status,
      min(d.claimed_at) started_at,max(d.finished_at) finished_at,count(*) filter(where d.status='sent') sent,count(*) filter(where d.status='failed') failed,max(d.attempts) attempts
      from public.custom_digest_deliveries d where d.household_id=hid and d.date=(select max(x.date) from public.custom_digest_deliveries x where x.household_id=hid and x.edition=d.edition) group by d.edition,d.date
    ) r));
 end if;
 return result;
end $$;
revoke all on function public.shared_household_ops(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_household_ops(text,text,jsonb) to anon;
commit;
