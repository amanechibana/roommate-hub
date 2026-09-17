begin;
do $$
declare hid uuid; a uuid; b uuid; pid uuid; result jsonb; other jsonb; vote jsonb;
begin
  select household_id into hid from public.shared_home_config;
  select user_id into a from public.members where household_id=hid and name='Amane';
  select user_id into b from public.members where household_id=hid and name not in ('Amane','Housemates') limit 1;
  result:=public.shared_household_life('test-gateway','poll_create',jsonb_build_object('actor',a,'title','Anonymous vacuum poll','options',jsonb_build_array('Yes','No'),'deadline',now()+interval '1 hour'));
  pid:=(result->'polls'->0->>'id')::uuid;
  perform public.shared_household_life('test-gateway','poll_vote',jsonb_build_object('actor',a,'id',pid,'choice',0));
  result:=public.shared_household_life('test-gateway','poll_vote',jsonb_build_object('actor',b,'id',pid,'choice',0));
  if result->'votes' <> jsonb_build_array(jsonb_build_object('poll_id',pid,'choice',0,'count',2)) then raise exception 'Write response did not aggregate ballots: %',result->'votes'; end if;
  other:=public.shared_household_life('test-gateway','get',jsonb_build_object('actor',a));
  if other->'votes'<>result->'votes' then raise exception 'Read/write poll results differ'; end if;
  other:=public.shared_household_life('test-gateway','get',jsonb_build_object('actor',b));
  if other->'votes'<>result->'votes' then raise exception 'Switching member revealed a ballot'; end if;
  other:=public.shared_household_life('test-gateway','get');
  if other->'votes'<>result->'votes' then raise exception 'Shared screen has different results'; end if;
  result:=public.shared_household_life('test-gateway','poll_vote',jsonb_build_object('actor',a,'id',pid,'choice',1));
  if (select count(*) from public.house_poll_votes where poll_id=pid)<>2 then raise exception 'Changed vote duplicated a ballot'; end if;
  if result->'votes' <> jsonb_build_array(jsonb_build_object('poll_id',pid,'choice',0,'count',1),jsonb_build_object('poll_id',pid,'choice',1,'count',1)) then raise exception 'Changed vote did not update counts'; end if;
  for vote in select value from jsonb_array_elements(result->'votes') loop
    if (select array_agg(key order by key) from jsonb_object_keys(vote) key)<>array['choice','count','poll_id'] then raise exception 'Ballot metadata leaked: %',vote; end if;
  end loop;
  if result ? 'my_vote' or result ? 'own_votes' then raise exception 'Actor ballot leaked'; end if;
  other:=result;
  update public.house_polls set deadline=now()-interval '1 second' where id=pid;
  result:=public.shared_household_life('test-gateway','poll_decide',jsonb_build_object('actor',a,'id',pid,'decision','Buy it'));
  if result->'votes'<>other->'votes' then raise exception 'Saved decision lost totals'; end if;
  if has_table_privilege('anon','public.house_poll_votes','select') or has_table_privilege('authenticated','public.house_poll_votes','select') then raise exception 'Client role can read raw ballots'; end if;
  if has_function_privilege('anon','public.shared_household_life_before_membership(text,text,jsonb)','execute') or has_function_privilege('anon','public.shared_household_life_before_pagination(text,text,jsonb)','execute') then raise exception 'Historical gateway publicly callable'; end if;
  if public.shared_household_ops('test-gateway','status')->>'schema_version'<>'029' then raise exception 'Schema version not advanced'; end if;
  -- The same response remains anonymous when invoked as the actual public role.
  set local role anon;
  result:=public.shared_household_life('test-gateway','get',jsonb_build_object('actor',b));
  reset role;
  if jsonb_array_length(result->'votes')<>2 then raise exception 'Public gateway results missing'; end if;
end $$;
rollback;
