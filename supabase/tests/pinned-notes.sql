-- Disposable database only, migrations 001–013 and test-gateway token.
begin;
do $$
declare a uuid; hid uuid; result jsonb; entry_id uuid;
begin
  select household_id into hid from public.shared_home_config;
  select user_id into a from public.members where household_id=hid and name='Amane';
  result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','note','title','Wi-Fi','category','Note'));
  entry_id := (result->'entries'->0->>'id')::uuid;
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',entry_id,'category','Pinned'));
  if (select category from public.entries where id=entry_id) <> 'Pinned' then raise exception 'Pin did not stick'; end if;
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',entry_id,'category','Note'));
  if (select category from public.entries where id=entry_id) <> 'Note' then raise exception 'Unpin did not stick'; end if;
  begin
    perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',entry_id,'category','Sticky'));
    raise exception 'Unknown category accepted' using errcode='P0002';
  exception when check_violation then null; end;
end $$;
rollback;
