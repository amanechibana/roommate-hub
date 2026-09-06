-- Run with psql -v ON_ERROR_STOP=1 against a disposable schema-initialized DB.
-- All fixtures are rolled back, including auth users.
begin;
insert into auth.users(id) values
('00000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000002'),
('00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select public.create_household('Test A', 'A owner');
select set_config('test.house_a', public.my_household()::text, true);
insert into public.entries(household_id, kind, title, category) values(public.my_household(), 'task', 'Private A task', 'Chore');
select set_config('test.old_invite', public.rotate_invite(), true);
select set_config('test.invite', public.rotate_invite(), true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$ begin
  if exists(select from public.entries) or exists(select from public.members) or exists(select from public.households) then
    raise exception 'FAIL: outsider sees private records';
  end if;
  begin
    perform public.join_household(current_setting('test.old_invite'), 'B owner');
    raise exception 'FAIL: rotated invite still works';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;
select public.create_household('Test B', 'B owner');
select set_config('test.house_b', public.my_household()::text, true);
insert into public.entries(household_id, kind, title, category) values(public.my_household(), 'task', 'Private B task', 'Chore');
do $$ declare affected int; begin
  if (select count(*) from public.entries) <> 1 or (select title from public.entries) <> 'Private B task' then raise exception 'FAIL: cross-household read'; end if;
  update public.entries set title = 'Hacked' where household_id = current_setting('test.house_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: cross-household update'; end if;
  delete from public.entries where household_id = current_setting('test.house_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: cross-household delete'; end if;
  begin
    insert into public.entries(household_id,kind,title,category) values(current_setting('test.house_a')::uuid,'task','Intrusion','Chore');
    raise exception 'FAIL: cross-household insert';
  exception when insufficient_privilege then null; end;
  begin
    update public.entries set assignee = '00000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: cross-household assignment';
  exception when foreign_key_violation then null; end;
  begin
    update public.entries set created_by = '00000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: creator can be forged';
  exception when insufficient_privilege then null; end;
  begin
    update public.entries set household_id = current_setting('test.house_a')::uuid;
    raise exception 'FAIL: household can be changed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.household_invites;
    raise exception 'FAIL: invitation hashes exposed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select public.join_household(current_setting('test.invite'), 'A roommate');
do $$ begin
  if (select count(*) from public.entries) <> 1 or (select title from public.entries) <> 'Private A task' then raise exception 'FAIL: member cannot see own household'; end if;
  if (select count(*) from public.members) <> 2 then raise exception 'FAIL: membership visibility'; end if;
  update public.entries set done = true;
  if not (select done from public.entries limit 1) then raise exception 'FAIL: member cannot complete tasks'; end if;
  begin
    perform public.rotate_invite();
    raise exception 'FAIL: non-owner can rotate invites';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

reset role;
update public.household_invites set expires_at = now() - interval '1 day';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
do $$ begin
  begin
    perform public.join_household(current_setting('test.invite'), 'Outsider');
    raise exception 'FAIL: expired invite works';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform * from public.entries;
    raise exception 'FAIL: anonymous data access';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_household('Unauthorized', 'Anonymous');
    raise exception 'FAIL: anonymous RPC access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: household isolation, permissions, membership, and invite expiry/rotation' as result;
