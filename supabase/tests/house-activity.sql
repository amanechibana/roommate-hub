-- Disposable database only, migrations 001–012 and test-gateway token.
begin;
do $$
declare a uuid; b uuid; hid uuid; result jsonb; entry_id uuid; started timestamptz := clock_timestamp(); n integer;
begin
  select household_id into hid from public.shared_home_config;
  select user_id into a from public.members where household_id=hid and name='Amane';
  select user_id into b from public.members where household_id=hid and name='Barnatt';
  result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','task','title','Water plants','category','Chore','assignee',a));
  entry_id := (result->'entries'->0->>'id')::uuid;
  update public.entries set created_at=now()-interval '1 year' where id=entry_id;
  result := public.shared_home('test-gateway','update',jsonb_build_object('actor',b,'id',entry_id,'done',true));
  if result->'activity'->0->>'actor' <> b::text or result->'activity'->0->>'action' <> 'completed'
    or (result->'activity'->0->>'created_at')::timestamptz < started then raise exception 'Wrong completion attribution/time'; end if;
  select count(*) into n from public.house_activity where household_id=hid;
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',entry_id,'done',true));
  if (select count(*) from public.house_activity where household_id=hid) <> n then raise exception 'Duplicate completion'; end if;
  result := public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',entry_id,'done',false));
  if result->'activity'->0->>'action' <> 'reopened' then raise exception 'Reopen missing'; end if;
  begin
    perform public.shared_home('wrong-token','get');
    raise exception 'Bad token accepted' using errcode='P0002';
  exception when insufficient_privilege then null; end;
  begin
    perform public.shared_home('test-gateway','update',jsonb_build_object('actor',gen_random_uuid(),'id',entry_id,'done',true));
    raise exception 'Bad actor accepted' using errcode='P0002';
  exception when insufficient_privilege then null; end;
  result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','request','title','Coffee','category','Need'));
  result := public.shared_home('test-gateway','update',jsonb_build_object('actor',b,'id',result->'entries'->0->>'id','done',true));
  if result->'activity'->0->>'action' <> 'bought' then raise exception 'Purchase missing'; end if;
  result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','note','title','Soup in fridge','category','Note'));
  if result->'activity'->0->>'action' <> 'noted' then raise exception 'Note missing'; end if;
  result := public.shared_home('test-gateway','get');
  if jsonb_array_length(result->'activity') < 4 then raise exception 'Feed missing on reload'; end if;
  if has_table_privilege('anon','public.house_activity','SELECT') or has_table_privilege('authenticated','public.house_activity','SELECT')
    or has_function_privilege('anon','public.shared_home_before_activity(text,text,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.shared_home_before_activity(text,text,jsonb)','EXECUTE') then raise exception 'Activity bypass exposed'; end if;
end $$;
rollback;
