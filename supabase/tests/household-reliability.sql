begin;
do $$
declare hid uuid; a uuid; b uuid; bill uuid:=gen_random_uuid(); expense uuid;
  result jsonb; claim uuid; retry uuid; cooldown uuid; total integer:=0; cursor text;
  gym uuid; house uuid; series uuid:=gen_random_uuid(); chores uuid; original uuid;
  today date:=(now() at time zone 'America/New_York')::date; fresh uuid:=gen_random_uuid(); fresh_seen boolean:=false; undo_token uuid:=gen_random_uuid();
begin
  select household_id into hid from public.shared_home_config;
  select user_id into a from public.members where household_id=hid and name='Amane';
  select user_id into b from public.members where household_id=hid and name='Barnatt';
  -- Cover only the outstanding original share, including deterministic odd cents.
  insert into public.entries(id,household_id,created_by,kind,title,category,date,amount,payment_members,paid_by)
    values(bill,hid,a,'event','Internet','Bill',today,50.01,array[b,a],array[b]);
  result:=public.shared_home('test-gateway','payment',jsonb_build_object('actor',a,'id',bill,'paid',true,'cover',true,
    'expense',jsonb_build_object('amount_cents',999999)));
  expense:=(result->'expense'->>'id')::uuid;
  if (result->'expense'->>'amount_cents')::integer<>(2500+case when a<b then 1 else 0 end) then raise exception 'Covered already-paid share or trusted client cents'; end if;
  if (select count(*) from jsonb_object_keys(result->'expense'->'shares'))<>1 then raise exception 'Cover includes a paid member'; end if;
  perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',a,'id',bill,'paid',true,'cover',true));
  if (select count(*) from public.bill_ledger_payments where bill_id=bill)<>1 then raise exception 'Cover replay duplicated'; end if;
  begin
    perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',a,'id',bill,'paid',false));
    raise exception 'Cleared a linked payment' using errcode='P0002';
  exception when raise_exception then null; end;
  begin
    update public.household_expenses set amount_cents=100,shares=jsonb_build_object(a,100) where id=expense;
    raise exception 'Edited linked money independently' using errcode='P0002';
  exception when raise_exception then null; end;
  begin
    update public.entries set amount=90 where id=bill;
    raise exception 'Edited linked bill independently' using errcode='P0002';
  exception when raise_exception then null; end;
  begin
    delete from public.entries where id=bill;
    raise exception 'Deleted linked bill independently' using errcode='P0002';
  exception when raise_exception then null; end;
  perform public.shared_expenses('test-gateway','delete',jsonb_build_object('actor',a,'id',expense));
  if (select paid_by from public.entries where id=bill)<>array[b] then raise exception 'Delete did not unwind only its own checks'; end if;
  -- A reminder check can be logged later without creating debt or clearing that check on delete.
  result:=public.shared_home('test-gateway','payment',jsonb_build_object('actor',b,'id',bill,'paid',true,'log_share',true));
  expense:=(result->'expense'->>'id')::uuid;
  if result->'expense'->'shares'->>b::text is null then raise exception 'Own share not logged'; end if;
  result:=public.shared_home('test-gateway','payment',jsonb_build_object('actor',b,'id',bill,'paid',true,'log_share',true));
  if result->'expense'->>'id'<>expense::text then raise exception 'Own-share replay duplicated'; end if;
  perform public.shared_expenses('test-gateway','delete',jsonb_build_object('actor',b,'id',expense));
  if (select paid_by from public.entries where id=bill)<>array[b] then raise exception 'Deleted a preexisting reminder check'; end if;
  begin
    perform public.shared_home('test-gateway','member',jsonb_build_object('actor',a,'name','Third'));
    raise exception 'Third housemate accepted' using errcode='P0002';
  exception when raise_exception then null; end;
  -- Bounded RPC pages, not a giant aggregate or a Data API row cap.
  insert into public.entries(household_id,created_by,kind,title,category,created_at)
    select hid,a,'task','Open '||g,'To-do',clock_timestamp()+g*interval '1 millisecond' from generate_series(1,1201) g;
  insert into public.entries(household_id,created_by,kind,title,category,done,created_at)
    select hid,a,'request','Archived '||g,'Need',true,now()-interval '100 days'+g*interval '1 millisecond' from generate_series(1,1101) g;
  insert into public.entries(id,household_id,created_by,kind,title,category,created_at)
    values(fresh,hid,a,'request','Bought today','Need',now()-interval '100 days');
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',fresh,'done',true));
  loop
    result:=public.shared_home('test-gateway','get',case when cursor is null then '{}'::jsonb else jsonb_build_object('cursor',cursor) end);
    if jsonb_array_length(result->'entries')>500 then raise exception 'Unbounded page'; end if;
    if exists(select 1 from jsonb_array_elements(result->'entries') e where e->>'title' like 'Archived %') then raise exception 'Old bought shopping in home'; end if;
    total:=total+(select count(*) from jsonb_array_elements(result->'entries') e where e->>'title' like 'Open %');
    fresh_seen:=fresh_seen or exists(select 1 from jsonb_array_elements(result->'entries') e where e->>'id'=fresh::text);
    cursor:=result->>'next_cursor'; exit when cursor is null;
  end loop;
  if total<>1201 then raise exception 'Lost open rows across pages: %',total; end if;
  if not fresh_seen then raise exception 'Archived an old request bought today'; end if;
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',fresh,'title','Temporary title','undo_token',undo_token));
  result:=public.shared_home('test-gateway','undo_edit',jsonb_build_object('actor',a,'undo_token',undo_token));
  if jsonb_array_length(result->'entries')>500 then raise exception 'Edit undo returned an unbounded snapshot'; end if;
  if (select title from public.entries where id=fresh)<>'Bought today' then raise exception 'Upstream edit undo was lost'; end if;
  result:=public.shared_home('test-gateway','history');
  if jsonb_array_length(result->'entries')<>50 or result->>'next_cursor' is null then raise exception 'History not paged'; end if;
  -- SQL-owned cooldowns and nonce-safe release work across separate instances.
  result:=public.shared_household_ops('test-gateway','claim_cooldown','{"slot":"nudge:test"}');
  cooldown:=(result->>'claim')::uuid;
  if cooldown is null or public.shared_household_ops('test-gateway','claim_cooldown','{"slot":"nudge:test"}')->>'claim' is not null then raise exception 'Cooldown did not hold'; end if;
  perform public.shared_household_ops('test-gateway','release_cooldown',jsonb_build_object('slot','nudge:test','claim',gen_random_uuid()));
  if public.shared_household_ops('test-gateway','claim_cooldown','{"slot":"nudge:test"}')->>'claim' is not null then raise exception 'Foreign nonce released claim'; end if;
  perform public.shared_household_ops('test-gateway','release_cooldown',jsonb_build_object('slot','nudge:test','claim',cooldown));
  if public.shared_household_ops('test-gateway','claim_cooldown','{"slot":"nudge:test"}')->>'claim' is null then raise exception 'Owned release failed'; end if;
  -- Failed digest retries retain delivered endpoint hashes; successful runs cannot replay.
  claim:=(public.shared_household_ops('test-gateway','claim_digest','{"edition":"morning"}')->>'claim')::uuid;
  if claim is null or public.shared_household_ops('test-gateway','claim_digest','{"edition":"morning"}')->>'claim' is not null then raise exception 'Concurrent digest claimed'; end if;
  perform public.shared_household_ops('test-gateway','digest_delivered',jsonb_build_object('edition','morning','claim',claim,'endpoint_hash',repeat('a',64)));
  perform public.shared_household_ops('test-gateway','finish_digest',jsonb_build_object('edition','morning','claim',claim,'status','partial','failed',1,'error_code','push_failed'));
  result:=public.shared_household_ops('test-gateway','claim_digest','{"edition":"morning"}'); retry:=(result->>'claim')::uuid;
  if retry=claim or retry is null or result->'delivered'<>jsonb_build_array(repeat('a',64)) then raise exception 'Retry lost delivered endpoint'; end if;
  begin
    perform public.shared_household_ops('test-gateway','finish_digest',jsonb_build_object('edition','morning','claim',claim,'status','sent'));
    raise exception 'Old digest worker finished new claim' using errcode='P0002';
  exception when raise_exception then null; end;
  perform public.shared_household_ops('test-gateway','finish_digest',jsonb_build_object('edition','morning','claim',retry,'status','sent'));
  if public.shared_household_ops('test-gateway','claim_digest','{"edition":"morning"}')->>'claim' is not null then raise exception 'Sent digest replayed'; end if;
  result:=public.shared_household_ops('test-gateway','status');
  if result->'reminders'->0->>'sent'<>'1' or result->'reminders'->0->>'attempts'<>'2' then raise exception 'Status lost durable counts'; end if;
  -- Append beyond an expired gym/chore horizon; preserve existing edits/logs/ids.
  insert into public.agreements(household_id,slug,title,status,signed_by,terms)
    values(hid,'gym','Gym','active',array[a,b],jsonb_build_object('template',(select jsonb_agg(jsonb_build_object('on',true,'time','07:00','day_type','Auto')) from generate_series(1,7)))) returning id into gym;
  perform public.shared_agreements('test-gateway','set_sessions',jsonb_build_object('actor',a,'agreement_id',gym,'series_id',series,'from_date',today-10,
    'sessions',jsonb_build_array(jsonb_build_object('date',today-10,'title','Pull day','time','07:00'))));
  select id into original from public.entries where series_id=series;
  update public.entries set description='Preserve this',done=true where id=original;
  insert into public.agreements(household_id,slug,title,status,signed_by) values(hid,'house','House','active',array[a,b]) returning id into house;
  result:=public.shared_agreements('test-gateway','set_chores',jsonb_build_object('actor',a,'agreement_id',house,'first_date',today-14,'weeks',2,
    'chores',jsonb_build_array(jsonb_build_object('title','Kitchen','weekday',0,'rotation',jsonb_build_array(a,b)))));
  chores:=(result->'series_ids'->>0)::uuid;
  result:=public.shared_household_ops('test-gateway','roll_forward');
  if result->>'failed'<>'0' or (result->>'inserted')::integer<80 then raise exception 'Schedules not extended: %',result; end if;
  if not exists(select 1 from public.entries where id=original and description='Preserve this' and done) then raise exception 'Cron replaced existing schedule'; end if;
  if (select max(date) from public.entries where series_id=series)<today+55 then raise exception 'Gym not rolled'; end if;
  if (select max(date) from public.entries where series_id=chores)<today+175 then raise exception 'Chores not rolled'; end if;
  if exists(select 1 from public.entries where series_id=chores and assignee<>case when ((date-(today-14))/7)%2=0 then a else b end) then raise exception 'Chore rotation phase lost'; end if;
  if public.shared_household_ops('test-gateway','roll_forward')->>'inserted'<>'0' then raise exception 'Cron replay duplicated'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform * from public.household_reminder_runs; raise exception 'Anon table access' using errcode='P0002'; exception when insufficient_privilege then null; end;
  begin perform public.shared_home_legacy('test-gateway','get'); raise exception 'Legacy unbounded gateway callable' using errcode='P0002'; exception when insufficient_privilege then null; end;
  begin perform public.shared_household_ops('wrong-token','status'); raise exception 'Bad token accepted' using errcode='P0002'; exception when insufficient_privilege then null; end;
  begin perform public.shared_household_ops('test-gateway','roll_forward',jsonb_build_object('actor',gen_random_uuid())); raise exception 'Unattributed retry allowed' using errcode='P0002'; exception when insufficient_privilege then null; end;
end $$;
rollback;
