-- Disposable database only, migrations 001–007 and gateway token test-gateway.
begin;
do $$
declare a uuid; b uuid; hid uuid; result jsonb; bill_id uuid; note_id uuid; chore_id uuid;
begin
 select household_id into hid from public.shared_home_config;
 select user_id into a from public.members where household_id=hid and name='Amane';
 select user_id into b from public.members where household_id=hid and name='Barnatt';
 -- One person covers a whole bill: every payer is checked off at once.
 result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','event','title','Electricity','category','Bill','amount',84.5,'date','2026-09-15'));
 bill_id := (result->'entries'->0->>'id')::uuid;
 perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',a,'id',bill_id,'paid',true,'cover',true));
 if (select paid_by from public.entries where id=bill_id) <> (select payment_members from public.entries where id=bill_id)
   or (select cardinality(paid_by) from public.entries where id=bill_id) <> 2 then raise exception 'Cover missed a payer'; end if;
 -- Cover on a non-bill is rejected like any other payment.
 result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','task','title','Sweep','category','Chore'));
 chore_id := (result->'entries'->0->>'id')::uuid;
 begin
  perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',a,'id',chore_id,'paid',true,'cover',true));
  raise exception 'Covered a chore' using errcode='P0002';
 exception when raise_exception then null; end;
 -- Notes convert to other kinds on update.
 result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','note','title','Buy a plant','category','Note'));
 note_id := (result->'entries'->0->>'id')::uuid;
 perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',note_id,'kind','request','title','Buy a plant','category','Need'));
 if (select kind from public.entries where id=note_id) <> 'request' then raise exception 'Note did not convert'; end if;
 -- Converting into a bill backfills payment checks without marking anyone paid.
 perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',note_id,'kind','event','category','Rent','date','2026-10-01'));
 if (select cardinality(payment_members) from public.entries where id=note_id) <> 2
   or (select cardinality(paid_by) from public.entries where id=note_id) <> 0 then raise exception 'Bill conversion missed payers'; end if;
 -- A note cannot become an event without a date.
 result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','note','title','Movie night?','category','Note'));
 begin
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',(result->'entries'->0->>'id')::uuid,'kind','event','category','Together'));
  raise exception 'Dateless event accepted' using errcode='P0002';
 exception when others then null; end;
 -- Leaving bill status still refuses to discard paid records.
 begin
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',bill_id,'kind','note','category','Note'));
  raise exception 'Lost paid history on kind change' using errcode='P0002';
 exception when raise_exception then null; end;
 perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',a,'id',bill_id,'paid',false));
 perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',b,'id',bill_id,'paid',false));
 perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',bill_id,'kind','note','category','Note','date',null));
 if (select kind from public.entries where id=bill_id) <> 'note'
   or (select cardinality(payment_members) from public.entries where id=bill_id) <> 0 then raise exception 'Bill did not convert cleanly'; end if;
end $$;
rollback;
