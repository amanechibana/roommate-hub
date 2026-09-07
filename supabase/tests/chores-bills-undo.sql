-- Disposable database only, migrations 001–005 and gateway token test-gateway.
begin;
do $$
declare a uuid; b uuid; hid uuid; result jsonb; sid uuid; first_id uuid; second_id uuid; token uuid; snapshot jsonb;
begin
 select household_id into hid from public.shared_home_config;
 select user_id into a from public.members where household_id=hid and name='Amane';
 select user_id into b from public.members where household_id=hid and name='Barnatt';
 result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','task','title','Dishes','category','Chore','assignee',a,'rotation_partner',b,'date','2026-09-01','repeat','weekly','repeat_until','2026-09-22'));
 if jsonb_array_length(result->'entries') <> 4 or result->'entries'->0->>'assignee' <> a::text or result->'entries'->1->>'assignee' <> b::text or result->'entries'->2->>'assignee' <> a::text then raise exception 'Rotation incorrect'; end if;
 first_id := (result->'entries'->0->>'id')::uuid; second_id := (result->'entries'->1->>'id')::uuid; sid := (result->'entries'->0->>'series_id')::uuid;
 perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',first_id,'scope','series','title','Kitchen dishes','assignee',a));
 if (select assignee from public.entries where id=second_id) <> b then raise exception 'Series edit erased rotation'; end if;
 begin
  perform public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','task','title','Invalid','category','Chore','assignee',a,'rotation_partner',a,'date','2026-09-01','repeat','weekly','repeat_until','2026-09-22'));
  raise exception 'Accepted invalid rotation' using errcode='P0002';
 exception when raise_exception then null; end;
 result := public.shared_home('test-gateway','create',jsonb_build_object('actor',a,'kind','event','title','Rent','category','Rent','amount',2000,'date','2026-09-01','repeat','monthly','repeat_until','2026-11-01'));
 first_id := (result->'entries'->0->>'id')::uuid; second_id := (result->'entries'->1->>'id')::uuid;
 perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',a,'id',first_id,'paid',true));
 perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',b,'id',first_id,'paid',true));
 perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',b,'id',first_id,'paid',true));
 if (select cardinality(paid_by) from public.entries where id=first_id) <> 2 then raise exception 'Payments lost or duplicated'; end if;
 if (select cardinality(paid_by) from public.entries where id=second_id) <> 0 then raise exception 'Payments leaked into next occurrence'; end if;
 perform public.shared_home('test-gateway','payment',jsonb_build_object('actor',a,'id',first_id,'paid',false));
 if (select paid_by from public.entries where id=first_id) <> array[b] then raise exception 'Unpay erased partner'; end if;
 begin
  perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',first_id,'category','Together'));
  raise exception 'Lost paid history on category change' using errcode='P0002';
 exception when raise_exception then null; end;
 perform public.shared_home('test-gateway','update',jsonb_build_object('actor',a,'id',first_id,'category','Bill','scope','series'));
 if (select paid_by from public.entries where id=first_id) <> array[b] then raise exception 'Bill category change lost payment'; end if;
 token:=gen_random_uuid();
 select jsonb_agg(to_jsonb(e) order by id) into snapshot from public.entries e where series_id=(select series_id from public.entries where id=first_id);
 perform public.shared_home('test-gateway','delete',jsonb_build_object('actor',a,'id',first_id,'scope','series','undo_token',token));
 if exists(select 1 from public.entries where id=first_id or id=second_id) then raise exception 'Series not deleted'; end if;
 begin
  perform public.shared_home('test-gateway','restore',jsonb_build_object('actor',b,'undo_token',token));
  raise exception 'Wrong person restored deletion' using errcode='P0002';
 exception when raise_exception then null; end;
 result := public.shared_home('test-gateway','restore',jsonb_build_object('actor',a,'undo_token',token));
 if snapshot <> (select jsonb_agg(to_jsonb(e) order by id) from public.entries e where series_id=(select series_id from public.entries where id=first_id)) then raise exception 'Restore changed original rows'; end if;
 begin
  perform public.shared_home('test-gateway','restore',jsonb_build_object('actor',a,'undo_token',token));
  raise exception 'Undo replay accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 token:=gen_random_uuid();
 perform public.shared_home('test-gateway','delete',jsonb_build_object('actor',a,'id',first_id,'undo_token',token));
 update public.deleted_entry_batches set expires_at=now()-interval '1 second' where id=token;
 begin
  perform public.shared_home('test-gateway','restore',jsonb_build_object('actor',a,'undo_token',token));
  raise exception 'Expired undo accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 -- Undo preserves alternating assignees, too.
 select id into first_id from public.entries where series_id=sid order by date limit 1;
 token:=gen_random_uuid();
 perform public.shared_home('test-gateway','delete',jsonb_build_object('actor',a,'id',first_id,'scope','series','undo_token',token));
 perform public.shared_home('test-gateway','restore',jsonb_build_object('actor',a,'undo_token',token));
 if (select array_agg(assignee order by date) from public.entries where series_id=sid) <> array[a,b,a,b] then raise exception 'Undo lost rotation'; end if;
end $$;
rollback;
