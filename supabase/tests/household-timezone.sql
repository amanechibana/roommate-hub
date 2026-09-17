begin;
do $$
declare hid uuid; actor uuid; result jsonb; shopping uuid:=gen_random_uuid(); item public.entries;
  zone text; expected date;
begin
  select household_id into hid from public.shared_home_config;
  select user_id into actor from public.members where household_id=hid and name='Amane';
  -- Choose a valid timezone whose date differs from the fixed NY default now.
  zone:=case when (now() at time zone 'Pacific/Kiritimati')::date <> (now() at time zone 'America/New_York')::date
    then 'Pacific/Kiritimati' else 'Pacific/Honolulu' end;
  perform public.shared_improvements('test-gateway','save_household',jsonb_build_object('actor',actor,
    'settings',jsonb_build_object('timezone',zone,'quiet_start','22:00','quiet_end','08:00','templates','[]'::jsonb)));
  expected:=(now() at time zone zone)::date;
  if public.household_today(hid)<>expected then raise exception 'Household day ignored timezone'; end if;
  if public.household_today(hid,'2026-01-01T10:30:00Z')<>(timestamptz '2026-01-01T10:30:00Z' at time zone zone)::date then raise exception 'Year boundary day wrong'; end if;
  result:=public.shared_coordination('test-gateway','get',jsonb_build_object('actor',actor));
  if (result->>'week')::date<>date_trunc('week',expected)::date then raise exception 'Check-in week ignored timezone'; end if;
  -- An offline shopping purchase posts an expense on the household day.
  result:=public.shared_home('test-gateway','create',jsonb_build_object('actor',actor,'id',shopping,'kind','request','title','Timezone groceries','category','Need','amount',12));
  shopping:=(result->'entries'->0->>'id')::uuid;
  select * into strict item from public.entries where id=shopping;
  result:=public.shared_shopping('test-gateway','sync',jsonb_build_object('actor',actor,'household_id',hid,'write_id',gen_random_uuid(),
    'id',shopping,'expected_done',item.done,'expected_completed_at',item.completed_at,'expected_title',item.title,'expected_amount',item.amount,'expected_category',item.category,'expected_assignee',item.assignee,'done',true));
  if result->>'ok' is distinct from 'true' then raise exception 'Shopping fixture failed: %',result; end if;
  if not exists(select 1 from public.household_expenses where household_id=hid and id=shopping and date=expected) then raise exception 'Shopping posting date ignored timezone'; end if;
  result:=public.shared_home('test-gateway','create',jsonb_build_object('actor',actor,'kind','event','title','Timezone bill','category','Bill','date',expected,'amount',24));
  result:=public.shared_home('test-gateway','payment',jsonb_build_object('actor',actor,'id',result->'entries'->0->>'id','paid',true,'cover',true));
  if (result->'expense'->>'date')::date is distinct from expected then raise exception 'Bill posting date ignored timezone'; end if;
  if public.shared_household_ops('test-gateway','status','{}')->>'schema_version'<>'028' then raise exception 'Schema status missing migration 028'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'shared_%' and
    (position('(now() at time zone ''America/New_York'')::date' in p.prosrc)>0 or p.prosrc ~ '\mcurrent_date\M')) then raise exception 'Fixed date remains in a gateway'; end if;
  if has_function_privilege('anon','public.household_today(uuid,timestamptz)','execute') or has_function_privilege('authenticated','public.household_today(uuid,timestamptz)','execute') then raise exception 'Internal day helper became public'; end if;
end $$;
rollback;
