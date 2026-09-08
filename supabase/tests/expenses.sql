begin;
do $$
declare a uuid; b uuid; hid uuid; eid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); foreign_home uuid:=gen_random_uuid(); foreign_expense uuid:=gen_random_uuid(); payload jsonb; result jsonb;
begin
 select household_id into hid from public.shared_home_config;
 select user_id into a from public.members where household_id=hid and name='Amane';
 select user_id into b from public.members where household_id=hid and name='Barnatt';
 insert into auth.users(id) values(stranger);
 insert into public.households(id,owner_id,name) values(foreign_home,stranger,'Other home');
 insert into public.members(user_id,household_id,name) values(stranger,foreign_home,'Other person');
 insert into public.household_expenses(id,household_id,kind,title,date,amount_cents,paid_by,shares,created_by) values(foreign_expense,foreign_home,'expense','Private purchase','2026-09-07',100,stranger,jsonb_build_object(stranger,100),stranger);
 payload := jsonb_build_object('id',eid,'actor',a,'kind','expense','title','Groceries','date','2026-09-07','amount_cents',5001,'paid_by',a,'shares',jsonb_build_object(a,2501,b,2500));
 result:=public.shared_expenses('test-gateway','create',payload);
 if result->'expense'->>'amount_cents'<>'5001' then raise exception 'Expense not stored'; end if;
 perform public.shared_expenses('test-gateway','create',payload);
 if (select count(*) from public.household_expenses where id=eid)<>1 then raise exception 'Create replay duplicated'; end if;
 perform public.shared_expenses('test-gateway','update',payload||jsonb_build_object('amount_cents',6000,'shares',jsonb_build_object(a,3000,b,3000)));
 if (select amount_cents from public.household_expenses where id=eid)<>6000 then raise exception 'Edit failed'; end if;
 perform public.shared_expenses('test-gateway','create',jsonb_build_object('id',sid,'actor',b,'kind','settlement','title','Repayment','date','2026-09-07','amount_cents',3000,'paid_by',b,'recipient',a,'shares','{}'::jsonb));
 if jsonb_array_length(public.shared_expenses('test-gateway','get')->'expenses')<>2 then raise exception 'Missing activity'; end if;
 begin
  perform public.shared_expenses('wrong-token','get');
  raise exception 'Bad token accepted' using errcode='P0002';
 exception when insufficient_privilege then null; end;
 begin
  perform public.shared_expenses('test-gateway','create',payload||jsonb_build_object('id',gen_random_uuid(),'actor',stranger));
  raise exception 'Foreign actor accepted' using errcode='P0002';
 exception when insufficient_privilege then null; end;
 begin
  perform public.shared_expenses('test-gateway','create',payload||jsonb_build_object('id',gen_random_uuid(),'paid_by',stranger));
  raise exception 'Foreign payer accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 begin
  perform public.shared_expenses('test-gateway','create',payload||jsonb_build_object('id',gen_random_uuid(),'shares',jsonb_build_object(stranger,5001)));
  raise exception 'Foreign split accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 begin
  perform public.shared_expenses('test-gateway','update',payload||jsonb_build_object('shares',jsonb_build_object(a,1,b,1)));
  raise exception 'Wrong sum accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 begin
  perform public.shared_expenses('test-gateway','create',payload||jsonb_build_object('id',gen_random_uuid(),'amount_cents',10.5));
  raise exception 'Fractional cent accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 begin
  perform public.shared_expenses('test-gateway','update',payload||jsonb_build_object('id',foreign_expense));
  raise exception 'Other household expense updated' using errcode='P0002';
 exception when raise_exception then null; end;
 begin
  perform public.shared_expenses('test-gateway','delete',jsonb_build_object('id',foreign_expense,'actor',a));
  raise exception 'Other household expense deleted' using errcode='P0002';
 exception when raise_exception then null; end;
 perform public.shared_expenses('test-gateway','delete',jsonb_build_object('id',eid,'actor',a));
 if exists(select 1 from public.household_expenses where id=eid) then raise exception 'Delete failed'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.household_expenses;
  raise exception 'Anonymous table read allowed' using errcode='P0002';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
