-- Disposable database only, migrations 001–017 and test-gateway token.
begin;
do $$
declare a uuid; result jsonb; first_id uuid; sid uuid;
begin
  select user_id into a from public.members where name='Amane' limit 1;
  result := public.shared_home('test-gateway','create',jsonb_build_object(
    'actor',a,'kind','event','title','Away','description','',
    'category','Away','date','2026-09-18','repeat','daily',
    'repeat_until','2026-09-20','assignee',a,
    'time_of_day','08:00','end_time','18:30'
  ));
  if jsonb_array_length(result->'entries') <> 3 then
    raise exception 'Away range did not create three dates';
  end if;
  first_id := (result->'entries'->0->>'id')::uuid;
  sid := (result->'entries'->0->>'series_id')::uuid;
  if sid is null or (result->'entries'->0->>'time_of_day') <> '08:00' then
    raise exception 'Range timing or series id was not saved';
  end if;
  perform public.shared_home('test-gateway','update',jsonb_build_object(
    'actor',a,'id',first_id,'title','Away','description','',
    'category','Away','date','2026-09-18','assignee',a,'amount',null,
    'url','','done',false,'scope','series','time_of_day','09:15','end_time',''
  ));
  if exists(select 1 from public.entries where series_id=sid and time_of_day <> '09:15') then
    raise exception 'Whole-series time edit missed an occurrence';
  end if;
end $$;
rollback;
