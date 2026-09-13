-- Disposable database only, migrations 001–014 and test-gateway token.
begin;
do $$
declare a uuid; hid uuid; result jsonb; entry_id uuid;
begin
  select household_id into hid from public.shared_home_config;
  select user_id into a from public.members where household_id=hid and name='Amane';
  result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','task','title','Renters insurance','category','Personal'));
  entry_id := (result->'entries'->0->>'id')::uuid;
  if (select category from public.entries where id=entry_id) <> 'Personal' then raise exception 'Personal to-do was not filed'; end if;
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',entry_id,'category','To-do'));
  if (select category from public.entries where id=entry_id) <> 'To-do' then raise exception 'Handing it to the house did not stick'; end if;
  begin
    perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',entry_id,'category','Private'));
    raise exception 'Unknown category accepted' using errcode='P0002';
  exception when check_violation then null; end;
end $$;
rollback;
