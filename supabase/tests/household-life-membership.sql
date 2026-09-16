begin;
do $$
declare a uuid; b uuid; hid uuid; rid uuid; pid uuid; mid uuid; result jsonb; blocked boolean:=false;
begin
  select household_id into hid from public.shared_home_config;
  select owner_id into a from public.households where id=hid;
  select user_id into b from public.members where household_id=hid and user_id<>a and name<>'Housemates' and active;
  perform public.shared_household_life('test-gateway','maintenance_save',jsonb_build_object('actor',a,'title','Membership repair','assignee',b,'status','open'));
  select id into rid from public.house_maintenance where household_id=hid and title='Membership repair';
  perform public.shared_household_life('test-gateway','meal_save',jsonb_build_object('actor',a,'title','Membership dinner','date',current_date+1,'cook',b));
  select id into mid from public.house_meals where household_id=hid and title='Membership dinner';
  perform public.shared_household_life('test-gateway','poll_create',jsonb_build_object('actor',a,'title','Membership poll','options',jsonb_build_array('Yes','No'),'deadline',now()+interval '1 hour'));
  select id into pid from public.house_polls where household_id=hid and title='Membership poll';
  perform public.shared_household_life('test-gateway','poll_vote',jsonb_build_object('actor',b,'id',pid,'choice',0));
  perform public.shared_coordination('test-gateway','remove_member',jsonb_build_object('actor',a,'member',b));
  if exists(select 1 from public.house_maintenance where id=rid and assignee=b) then raise exception 'Departed member still assigned a repair'; end if;
  if exists(select 1 from public.house_meals where id=mid and cook=b) then raise exception 'Departed member still assigned a future dinner'; end if;
  if exists(select 1 from public.house_poll_votes where poll_id=pid and member_id=b) then raise exception 'Departed vote retained on undecided poll'; end if;
  begin perform public.shared_household_life('test-gateway','pantry_save',jsonb_build_object('actor',b,'title','Unauthorized rice','status','low')); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Former member authored household life'; end if;
  blocked:=false;
  begin perform public.shared_household_life('test-gateway','maintenance_save',jsonb_build_object('actor',a,'title','Invalid assignment','assignee',b,'status','open')); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Former member received new repair'; end if;
  if (public.shared_household_ops('test-gateway','status')->>'schema_version')::integer<24 then raise exception 'Schema version is stale'; end if;
  if has_function_privilege('anon','public.shared_household_life_before_membership(text,text,jsonb)','execute') or has_function_privilege('anon','public.shared_coordination_before_life(text,text,jsonb)','execute') then raise exception 'Membership guard bypass exposed'; end if;
end $$;
rollback;
