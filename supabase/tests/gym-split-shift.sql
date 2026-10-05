begin;
do $$
declare hid uuid; a uuid; m uuid; gym_id uuid; series uuid:=gen_random_uuid(); missed uuid; other uuid; result jsonb;
begin
 select household_id into hid from public.shared_home_config;
 select owner_id into a from public.households where id=hid;
 result:=public.shared_agreements('test-gateway','save',jsonb_build_object('actor',a,'slug','gym','title','The Iron Pact','terms',jsonb_build_object('days_per_week',3,'miss_trigger',3)));
 gym_id:=(result->'agreement'->>'id')::uuid;
 perform public.shared_agreements('test-gateway','propose',jsonb_build_object('actor',a,'slug','gym'));
 for m in select user_id from public.members where household_id=hid and active and name<>'Housemates' and user_id<>a loop
  perform public.shared_agreements('test-gateway','sign',jsonb_build_object('actor',m,'slug','gym'));
 end loop;
 if (select status from public.agreements where id=gym_id)<>'active' then raise exception 'Gym agreement did not activate'; end if;

 -- A drifted schedule: every session is a Pull day.
 perform public.shared_agreements('test-gateway','set_sessions',jsonb_build_object('actor',a,'agreement_id',gym_id,
  'series_id',series,'from_date',(current_date+1)::text,'sessions',(select jsonb_agg(jsonb_build_object(
   'date',(current_date+d)::text,'time','07:00','title','Pull day')) from generate_series(1,5) d)));
 select id into missed from public.entries where series_id=series and date=current_date+1;

 insert into public.entries(household_id,kind,title,category,date,created_by) values(hid,'event','Open gym','Gym',current_date+1,a) returning id into other;
 begin
  perform public.shared_agreements('test-gateway','event',jsonb_build_object('actor',a,'agreement_id',gym_id,'kind','shift','entry_id',other));
  raise exception 'Shift accepted a session outside the gym series' using errcode='P0002';
 exception when raise_exception then null; end;

 result:=public.shared_agreements('test-gateway','event',jsonb_build_object('actor',a,'agreement_id',gym_id,'kind','shift','entry_id',missed));
 if result->'event'->>'status'<>'done' then raise exception 'Shift should be recorded without acceptance'; end if;
 if (select title from public.entries where id=missed)<>'Pull day' then raise exception 'Shift retitled the missed session'; end if;
 if (select array_agg(title order by date) from public.entries where series_id=series and date>current_date+1)
   <>array['Pull day','Legs day','Push day','Pull day'] then
  raise exception 'Later sessions did not restart the rotation at the missed workout'; end if;
 if (select next_cycle from public.agreement_schedule_state where series_id=series)<>2 then
  raise exception 'Roll-forward would not continue after the shifted tail'; end if;
 if not exists(select 1 from public.house_activity where household_id=hid and title='Gym split shift') then
  raise exception 'Shift missing from the activity feed'; end if;
end $$;
rollback;
