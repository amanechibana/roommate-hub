begin;
do $$
declare a uuid; b uuid; hid uuid; gym_id uuid; house_id uuid; amendment_id uuid; gym_entry uuid;
  series uuid:=gen_random_uuid(); chore_series uuid; assignees uuid[]; result jsonb;
begin
 select household_id into hid from public.shared_home_config;
 select user_id into a from public.members where household_id=hid and name='Amane';
 select user_id into b from public.members where household_id=hid and name='Barnatt';

 -- save -> propose -> sign -> active
 result:=public.shared_agreements('test-gateway','save',jsonb_build_object('actor',a,'slug','gym','title','The Iron Pact','terms',jsonb_build_object('days_per_week',3,'miss_trigger',3)));
 gym_id:=(result->'agreement'->>'id')::uuid;
 if result->'agreement'->>'status'<>'draft' then raise exception 'Save did not produce a draft'; end if;
 result:=public.shared_agreements('test-gateway','propose',jsonb_build_object('actor',a,'slug','gym'));
 if result->'agreement'->>'status'<>'proposed' then raise exception 'Propose failed'; end if;
 begin
  perform public.shared_agreements('test-gateway','sign',jsonb_build_object('actor',a,'slug','gym'));
  raise exception 'Second signature by the same signer accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 result:=public.shared_agreements('test-gateway','sign',jsonb_build_object('actor',b,'slug','gym'));
 if result->'agreement'->>'status'<>'active' then raise exception 'Both signatures did not activate'; end if;
 if not (select signed_by @> array[a,b] from public.agreements where id=gym_id) then raise exception 'Signatures not recorded'; end if;
 begin
  perform public.shared_agreements('test-gateway','save',jsonb_build_object('actor',a,'slug','gym','title','Rewrite','terms','{}'::jsonb));
  raise exception 'Active agreement edited directly' using errcode='P0002';
 exception when raise_exception then null; end;

 -- amendment approve applies the terms patch
 result:=public.shared_agreements('test-gateway','amend',jsonb_build_object('actor',a,'agreement_id',gym_id,'title','Raise the miss trigger','body','Life happens.','terms_patch',jsonb_build_object('miss_trigger',4)));
 amendment_id:=(result->'amendment'->>'id')::uuid;
 begin
  perform public.shared_agreements('test-gateway','amend_decide',jsonb_build_object('actor',a,'id',amendment_id,'approve',true));
  raise exception 'Proposer decided own amendment' using errcode='P0002';
 exception when raise_exception then null; end;
 result:=public.shared_agreements('test-gateway','amend_decide',jsonb_build_object('actor',b,'id',amendment_id,'approve',true));
 if result->'amendment'->>'status'<>'approved' then raise exception 'Amendment not approved'; end if;
 if (select terms->>'miss_trigger' from public.agreements where id=gym_id)<>'4' then raise exception 'Terms patch not applied'; end if;

 -- pto: quarter-hour steps only, recorded unilaterally
 begin
  perform public.shared_agreements('test-gateway','event',jsonb_build_object('actor',a,'agreement_id',gym_id,'kind','pto','hours',1.1));
  raise exception 'Bad PTO increment accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 result:=public.shared_agreements('test-gateway','event',jsonb_build_object('actor',a,'agreement_id',gym_id,'kind','pto','hours',0.75));
 if result->'event'->>'status'<>'done' then raise exception 'PTO not recorded as done'; end if;

 -- set_sessions writes timed Gym entries and replaces future rows on re-run
 result:=public.shared_agreements('test-gateway','set_sessions',jsonb_build_object('actor',a,'agreement_id',gym_id,
  'series_id',series,'from_date',(current_date+1)::text,'sessions',jsonb_build_array(
   jsonb_build_object('date',(current_date+2)::text,'time','06:30','title','Push day'),
   jsonb_build_object('date',(current_date+4)::text,'time','06:30','title','Pull day'))));
 if (result->>'count')<>'2' then raise exception 'Sessions not inserted'; end if;
 if (select count(*) from public.entries where series_id=series and kind='event' and category='Gym' and time_of_day='06:30')<>2 then
  raise exception 'Gym entries missing time_of_day'; end if;
 if (select terms->>'gym_series_id' from public.agreements where id=gym_id)<>series::text then raise exception 'Series id not stored in terms'; end if;
 perform public.shared_agreements('test-gateway','set_sessions',jsonb_build_object('actor',a,'agreement_id',gym_id,
  'series_id',series,'from_date',(current_date+1)::text,'sessions',jsonb_build_array(
   jsonb_build_object('date',(current_date+3)::text,'time','07:00','title','Push day'))));
 if (select count(*) from public.entries where series_id=series)<>1 then raise exception 'Re-run did not replace sessions'; end if;
 result:=public.shared_home('test-gateway','get');
 if not exists(select 1 from jsonb_array_elements(result->'entries') e where e.value->>'time_of_day'='07:00') then
  raise exception 'shared_home get missing time_of_day'; end if;

 -- workout log upserts per member
 select id into gym_entry from public.entries where series_id=series;
 perform public.shared_agreements('test-gateway','log',jsonb_build_object('actor',a,'entry_id',gym_entry,'day_type','Push',
  'weights_minutes',45,'cardio_minutes',15,'exercises',jsonb_build_array(jsonb_build_object('name','Bench','sets',
   jsonb_build_array(jsonb_build_object('reps',8,'weight','135')))),'notes','Solid.'));
 perform public.shared_agreements('test-gateway','log',jsonb_build_object('actor',a,'entry_id',gym_entry,'day_type','Push',
  'weights_minutes',50,'cardio_minutes',10,'exercises','[]'::jsonb,'notes','Better.'));
 if (select count(*) from public.gym_logs where entry_id=gym_entry and member=a)<>1 then raise exception 'Log re-save duplicated'; end if;
 if (select weights_minutes from public.gym_logs where entry_id=gym_entry and member=a)<>50 then raise exception 'Log upsert did not update'; end if;

 -- house agreement: set_chores alternates the rotation and replaces on re-run
 perform public.shared_agreements('test-gateway','save',jsonb_build_object('actor',b,'slug','house','title','The Clean Split','terms',jsonb_build_object('max_swaps_month',2)));
 perform public.shared_agreements('test-gateway','propose',jsonb_build_object('actor',b,'slug','house'));
 perform public.shared_agreements('test-gateway','sign',jsonb_build_object('actor',a,'slug','house'));
 select id into house_id from public.agreements where household_id=hid and slug='house' and status='active';
 if house_id is null then raise exception 'House agreement not active'; end if;
 result:=public.shared_agreements('test-gateway','set_chores',jsonb_build_object('actor',a,'agreement_id',house_id,
  'first_date',(current_date+6)::text,'weeks',4,'chores',jsonb_build_array(
   jsonb_build_object('title','Bundle A','description','Kitchen','weekday',0,'rotation',jsonb_build_array(a,b)))));
 chore_series:=(result->'series_ids'->>0)::uuid;
 assignees:=array(select assignee from public.entries where series_id=chore_series order by date);
 if assignees<>array[a,b,a,b] then raise exception 'Rotation not alternating'; end if;
 if (select count(*) from public.entries where series_id=chore_series and kind='task' and category='Chore' and rotation_members=array[a,b])<>4 then
  raise exception 'Chore rows malformed'; end if;
 perform public.shared_agreements('test-gateway','set_chores',jsonb_build_object('actor',b,'agreement_id',house_id,
  'first_date',(current_date+6)::text,'weeks',2,'chores',jsonb_build_array(
   jsonb_build_object('title','Bundle A','description','Kitchen','weekday',0,'rotation',jsonb_build_array(b,a)))));
 if (select count(*) from public.entries where series_id=chore_series)<>0 then raise exception 'Re-run kept the old chore series'; end if;

 -- widened category check: Gym events yes, Gym tasks no
 insert into public.entries(household_id,kind,title,category,date,created_by) values(hid,'event','Open gym','Gym',current_date+9,a);
 begin
  insert into public.entries(household_id,kind,title,category,date,created_by) values(hid,'task','Gym chore','Gym',current_date+9,a);
  raise exception 'Gym task accepted' using errcode='P0002';
 exception when check_violation then null; end;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.agreements;
  raise exception 'Anonymous table read allowed' using errcode='P0002';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.gym_logs;
  raise exception 'Anonymous log read allowed' using errcode='P0002';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
