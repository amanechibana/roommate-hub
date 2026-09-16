-- Disposable PostgreSQL only, with migrations 001–017, 019–020.
begin;
do $$
declare a uuid; b uuid; hid uuid; result jsonb; sid uuid; selected uuid; token uuid:=gen_random_uuid(); token2 uuid:=gen_random_uuid();
  old_rows jsonb; agid uuid; amid uuid; request_id uuid; handbook_id uuid; eid uuid:=gen_random_uuid(); count_before integer;
begin
  select household_id into hid from public.shared_home_config;
  select user_id into a from public.members where household_id=hid and name='Amane';
  select user_id into b from public.members where household_id=hid and name='Barnatt';
  result:=public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','task','title','Trash','category','Chore','date','2026-09-16',
    'repeat','weekdays','repeat_days',jsonb_build_array(2,5),'repeat_interval',2,'repeat_until','2026-10-02','assignee',a,'rotation_partner',b));
  if jsonb_array_length(result->'entries')<>3 or result->'entries'->0->>'date'<>'2026-09-18'
    or result->'entries'->1->>'date'<>'2026-09-29' or result->'entries'->2->>'date'<>'2026-10-02' then raise exception 'Wrong weekday expansion'; end if;
  selected:=(result->'entries'->0->>'id')::uuid; sid:=(result->'entries'->0->>'series_id')::uuid;
  if (result->'entries'->1->>'assignee')::uuid<>b or (result->'entries'->2->>'assignee')::uuid<>a then raise exception 'Weekday rotation wrong'; end if;
  select jsonb_agg(to_jsonb(e) order by e.id) into old_rows from public.entries e where series_id=sid;
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',selected,'scope','series','title','Wrong title','date','2026-09-19','undo_token',token));
  if (select count(*) from public.entries where series_id=sid and title='Wrong title')<>3 then raise exception 'Series edit failed'; end if;
  begin
    perform public.shared_home('test-gateway','undo_edit',jsonb_build_object('actor',b,'undo_token',token));
    raise exception 'Other actor undid edit' using errcode='P0002';
  exception when raise_exception then null; end;
  perform public.shared_home('test-gateway','undo_edit',jsonb_build_object('actor',a,'undo_token',token));
  if (select jsonb_agg(to_jsonb(e) order by e.id) from public.entries e where series_id=sid) is distinct from old_rows then raise exception 'Undo did not restore full series'; end if;
  begin
    perform public.shared_home('test-gateway','undo_edit',jsonb_build_object('actor',a,'undo_token',token));
    raise exception 'Undo token reused' using errcode='P0002';
  exception when raise_exception then null; end;
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',selected,'title','Changed','undo_token',token2));
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',b,'id',selected,'description','New housemate edit'));
  begin
    perform public.shared_home('test-gateway','undo_edit',jsonb_build_object('actor',a,'undo_token',token2));
    raise exception 'Undo overwrote a later edit' using errcode='P0002';
  exception when raise_exception then null; end;
  if (select description from public.entries where id=selected)<>'New housemate edit' then raise exception 'Later edit lost'; end if;
  begin
    perform public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','task','title','Bad days','category','Chore','date','2026-09-16',
      'repeat','weekdays','repeat_days',jsonb_build_array(8),'repeat_until','2026-10-02'));
    raise exception 'Invalid weekdays accepted' using errcode='P0002';
  exception when raise_exception then null; end;
  begin
    perform public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','task','title','Bad interval','category','Chore','date','2026-09-16',
      'repeat','weekdays','repeat_days',jsonb_build_array(2),'repeat_interval',0,'repeat_until','2026-10-02'));
    raise exception 'Invalid interval accepted' using errcode='P0002';
  exception when raise_exception then null; end;
  result:=public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','event','title','Rent','category','Rent','date','2026-01-31',
    'repeat','monthly','repeat_interval',2,'repeat_until','2026-07-31','amount',2001,'time_of_day','09:00','end_time','10:00'));
  if jsonb_array_length(result->'entries')<>4 or result->'entries'->1->>'date'<>'2026-03-31' or result->'entries'->0->>'end_time'<>'10:00'
    or jsonb_array_length(result->'entries'->0->'payment_members')<>2 then raise exception 'Custom interval lost timing or bill members'; end if;

  perform public.shared_expenses('test-gateway','create',jsonb_build_object('actor',a,'id',eid,'kind','expense','title','Dinner','date','2026-09-16',
    'amount_cents',201,'paid_by',a,'shares',jsonb_build_object(a::text,101,b::text,100)));
  token:=gen_random_uuid();
  perform public.shared_expenses('test-gateway','update',(select to_jsonb(e) from public.household_expenses e where id=eid) || jsonb_build_object('actor',a,'id',eid,'amount_cents',301,'shares',jsonb_build_object(a::text,151,b::text,150),'undo_token',token));
  perform public.shared_expenses('test-gateway','undo_edit',jsonb_build_object('actor',a,'undo_token',token));
  if (select amount_cents from public.household_expenses where id=eid)<>201 then raise exception 'Expense undo lost cents'; end if;
  token:=gen_random_uuid();
  perform public.shared_expenses('test-gateway','update',(select to_jsonb(e) from public.household_expenses e where id=eid) || jsonb_build_object('actor',a,'id',eid,'title','Wrong title','undo_token',token));
  update public.edit_undo_batches set expires_at=clock_timestamp()-interval '1 second' where id=token;
  begin
    perform public.shared_expenses('test-gateway','undo_edit',jsonb_build_object('actor',a,'undo_token',token));
    raise exception 'Expired undo accepted' using errcode='P0002';
  exception when raise_exception then null; end;

  result:=public.shared_agreements('test-gateway','save',jsonb_build_object('actor',a,'slug','gym','title','Gym pact','terms',jsonb_build_object('pto',jsonb_build_object('hours',3,'period','month'))));
  agid:=(result->'agreement'->>'id')::uuid;
  perform public.shared_agreements('test-gateway','propose',jsonb_build_object('actor',a,'slug','gym'));
  perform public.shared_agreements('test-gateway','sign',jsonb_build_object('actor',b,'slug','gym'));
  result:=public.shared_agreements('test-gateway','amend',jsonb_build_object('actor',a,'agreement_id',agid,'title','Later start','body','After work'));
  amid:=(result->'amendment'->>'id')::uuid;
  perform public.shared_agreements('test-gateway','amend_decide',jsonb_build_object('actor',b,'id',amid,'approve',false,'reason','Prefer mornings'));
  if not exists(select 1 from public.house_activity where actor=b and action='declined' and title='Amendment: Later start') then raise exception 'Amendment decision missing history'; end if;
  perform public.shared_agreements('test-gateway','event',jsonb_build_object('actor',a,'agreement_id',agid,'kind','pto','hours',0.75));
  if not exists(select 1 from public.house_activity where actor=a and action='recorded' and title='Gym PTO') then raise exception 'PTO missing history'; end if;
  result:=public.shared_handbook('test-gateway','create',jsonb_build_object('actor',a,'section','wifi','title','Router','value','PRIVATE PASSWORD','notes','PRIVATE NOTES'));
  handbook_id:=(result->'entry'->>'id')::uuid;
  perform public.shared_handbook('test-gateway','update',jsonb_build_object('actor',b,'id',handbook_id,'section','wifi','title','Guest router','value','ANOTHER PASSWORD'));
  if not exists(select 1 from public.house_activity where actor=b and action='edited' and title='Handbook: Guest router') then raise exception 'Handbook edit missing history'; end if;
  if exists(select 1 from public.house_activity where title like '%PASSWORD%' or title like '%PRIVATE NOTES%') then raise exception 'Handbook secret leaked into feed'; end if;
  if has_function_privilege('anon','public.shared_home_before_edit_undo(text,text,jsonb)','execute') or
    has_table_privilege('anon','public.edit_undo_batches','select') then raise exception 'Undo private internals exposed'; end if;
end $$;
rollback;
