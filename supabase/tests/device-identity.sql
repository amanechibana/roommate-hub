-- Run after migrations 001–004 in a disposable local database.
begin;
do $$
declare result jsonb; actor uuid; barnatt uuid; other_id uuid; entry_id uuid; hid uuid;
begin
  select household_id into hid from public.shared_home_config;
  select user_id into actor from public.members where household_id=hid and name='Amane';
  select user_id into barnatt from public.members where household_id=hid and name='Barnatt';
  if actor is null or barnatt is null or actor=barnatt then raise exception 'People missing'; end if;
  result := public.shared_home('test-gateway', 'create', jsonb_build_object('actor',actor,'kind','task','title','Dishes','category','Chore','assignee',barnatt));
  if jsonb_array_length(result->'entries') <> 1 then raise exception 'Missing created row'; end if;
  if (result->'entries'->0->>'created_by')::uuid <> actor then raise exception 'Wrong creator'; end if;
  entry_id := (result->'entries'->0->>'id')::uuid;
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',barnatt,'id',entry_id,'done',true));
  if not (select done from public.entries where id=entry_id) then raise exception 'Toggle failed'; end if;
  result := public.shared_home('test-gateway','create',jsonb_build_object('actor',barnatt,'kind','task','title','Weekly clean','category','Chore','date','2026-09-01','repeat','weekly','repeat_until','2026-09-15'));
  if jsonb_array_length(result->'entries') <> 3 then raise exception 'Missing series rows'; end if;
  if (result->'entries'->2->>'created_by')::uuid <> barnatt then raise exception 'Series creator wrong'; end if;
  if result->'entries'->0->>'date' <> '2026-09-01' or result->'entries'->2->>'date' <> '2026-09-15' then raise exception 'Series order wrong'; end if;
  other_id := gen_random_uuid();
  insert into auth.users(id) values(other_id);
  begin
    perform public.shared_home('test-gateway','create',jsonb_build_object('actor',other_id,'kind','task','title','Invalid actor','category','Chore'));
    raise exception 'Accepted outsider';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.shared_home('test-gateway','delete',jsonb_build_object('id',entry_id));
    raise exception 'Accepted missing actor';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.shared_home('wrong-token','get');
    raise exception 'Accepted bad gateway token';
  exception when insufficient_privilege then null;
  end;
  perform public.shared_home('test-gateway','delete',jsonb_build_object('actor',actor,'id',entry_id));
  if exists(select 1 from public.entries where id=entry_id) then raise exception 'Delete failed'; end if;
end $$;
rollback;
