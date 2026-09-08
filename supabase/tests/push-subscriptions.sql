begin;
do $$
declare a uuid; b uuid; hid uuid; stranger uuid:=gen_random_uuid(); foreign_home uuid:=gen_random_uuid();
  ep text:='https://push.example/device-1'; keys jsonb:=jsonb_build_object('p256dh','key','auth','secret'); result jsonb;
begin
 select household_id into hid from public.shared_home_config;
 select user_id into a from public.members where household_id=hid and name='Amane';
 select user_id into b from public.members where household_id=hid and name='Barnatt';
 insert into auth.users(id) values(stranger);
 insert into public.households(id,owner_id,name) values(foreign_home,stranger,'Other home');
 insert into public.members(user_id,household_id,name) values(stranger,foreign_home,'Other person');
 perform public.shared_push('test-gateway','subscribe',jsonb_build_object('endpoint',ep,'member',a,'keys',keys));
 result:=public.shared_push('test-gateway','get');
 if jsonb_array_length(result->'subscriptions')<>1 then raise exception 'Subscription not stored'; end if;
 perform public.shared_push('test-gateway','subscribe',jsonb_build_object('endpoint',ep,'member',b,'keys',keys));
 if (select member from public.push_subscriptions where endpoint=ep)<>b then raise exception 'Resubscribe did not move the device'; end if;
 if (select count(*) from public.push_subscriptions where household_id=hid)<>1 then raise exception 'Resubscribe duplicated'; end if;
 begin
  perform public.shared_push('wrong-token','get');
  raise exception 'Bad token accepted' using errcode='P0002';
 exception when insufficient_privilege then null; end;
 begin
  perform public.shared_push('test-gateway','subscribe',jsonb_build_object('endpoint','https://push.example/device-2','member',stranger,'keys',keys));
  raise exception 'Foreign member accepted' using errcode='P0002';
 exception when insufficient_privilege then null; end;
 begin
  perform public.shared_push('test-gateway','subscribe',jsonb_build_object('endpoint','http://insecure.example','member',a,'keys',keys));
  raise exception 'Insecure endpoint accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 begin
  perform public.shared_push('test-gateway','subscribe',jsonb_build_object('endpoint','https://push.example/device-3','member',a,'keys',jsonb_build_object('p256dh','only')));
  raise exception 'Partial keys accepted' using errcode='P0002';
 exception when raise_exception then null; end;
 perform public.shared_push('test-gateway','unsubscribe',jsonb_build_object('endpoint',ep));
 if exists(select 1 from public.push_subscriptions where endpoint=ep) then raise exception 'Unsubscribe failed'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.push_subscriptions;
  raise exception 'Anonymous table read allowed' using errcode='P0002';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
