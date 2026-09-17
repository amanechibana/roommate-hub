-- Expand membership and preserve the installed gateways, wrappers, and ACLs.
begin;
alter table public.agreement_events add column accepted_by uuid[] not null default '{}';
alter table public.agreement_amendments add column approved_by uuid[] not null default '{}';
update public.agreement_amendments set approved_by=array[decided_by] where status='approved' and decided_by is not null;
-- Preserve pending requests created by the previous two-person interface.
update public.agreement_events e set details=e.details||jsonb_build_object('recipient',(
 select m.user_id from public.members m where m.household_id=e.household_id and m.active and m.name<>'Housemates' and m.user_id<>e.actor limit 1))
where e.status='open' and e.kind in ('swap','skip_cover') and not (e.details ? 'recipient');
do $upgrade$
declare definition text;
begin
  definition := pg_get_functiondef('public.shared_coordination_before_life(text,text,jsonb)'::regprocedure);
  if strpos(definition, $old$ if (select count(*) from public.members where household_id=hid and active and name<>'Housemates')>=2 then raise exception 'This household currently supports two people. Remove a departing housemate before inviting a replacement.'; end if;$old$)=0 then raise exception 'Unexpected implementation: shared_coordination_before_life'; end if;
  definition := replace(definition, $old$ if (select count(*) from public.members where household_id=hid and active and name<>'Housemates')>=2 then raise exception 'This household currently supports two people. Remove a departing housemate before inviting a replacement.'; end if;$old$, $new$$new$);
  if strpos(definition, $old$ return jsonb_build_object('member_id',target);$old$)=0 then raise exception 'Unexpected implementation: shared_coordination_before_life'; end if;
  definition := replace(definition, $old$ return jsonb_build_object('member_id',target);$old$, $new$ -- A changed roster reviews agreements together; preserve signed history.
 insert into public.house_membership_agreement_archive(household_id,departed_member,agreement)
 select hid,target,to_jsonb(a) from public.agreements a where household_id=hid and status<>'draft';
 delete from public.entries e where e.household_id=hid and e.date>=today and not e.done
 and e.series_id in (select series_id from public.agreement_schedule_state where household_id=hid);
 delete from public.agreement_schedule_state where household_id=hid;
 update public.agreement_amendments set status='withdrawn' where household_id=hid and status='open';
 update public.agreement_events set status='declined',decided_by=current_actor,decided_at=now() where household_id=hid and status='open';
 update public.agreements set status='draft',signed_by='{}',proposed_by=null,proposed_at=null,
 terms=terms-'chore_series_ids'-'gym_series_id',updated_at=now() where household_id=hid;
 return jsonb_build_object('member_id',target);$new$);
  execute definition;
  definition := pg_get_functiondef('public.shared_home(text,text,jsonb)'::regprocedure);
  if strpos(definition, $old$jsonb_agg(value||case when value->>'kind'='task' then$old$)=0 then raise exception 'Unexpected implementation: shared_home'; end if;
  definition := replace(definition, $old$jsonb_agg(value||case when value->>'kind'='task' then$old$, $new$jsonb_agg(value||jsonb_build_object('completed_by',value->'last_done_by')||case when value->>'kind'='task' then$new$);
  if strpos(definition, $old$private_action boolean:=false;$old$)=0 then raise exception 'Unexpected implementation: shared_home'; end if;
  definition := replace(definition, $old$private_action boolean:=false;$old$, $new$private_action boolean:=false; rotation uuid[];$new$);
  if strpos(definition, $old$ if operation in ('update','delete','payment','split_shopping') then$old$)=0 then raise exception 'Unexpected implementation: shared_home'; end if;
  definition := replace(definition, $old$ if operation in ('update','delete','payment','split_shopping') then$old$, $new$ if operation='create' and payload ? 'rotation_members' then
   if jsonb_typeof(payload->'rotation_members') is distinct from 'array' then raise exception 'Choose a rotation roster'; end if;
   rotation:=array(select value::uuid from jsonb_array_elements_text(payload->'rotation_members'));
   if payload->>'kind'<>'task' or coalesce(payload->>'repeat','')='' or nullif(payload->>'date','') is null
     or cardinality(rotation)<2 or cardinality(rotation)<>(select count(distinct x) from unnest(rotation) x)
     or rotation[1] is distinct from nullif(payload->>'assignee','')::uuid
     or exists(select 1 from unnest(rotation) x where not exists(select 1 from public.members m where m.household_id=hid and m.user_id=x and m.active and m.name<>'Housemates')) then
     raise exception 'Choose at least two different current housemates, beginning with the first assignee';
   end if;
   payload:=payload-'rotation_partner';
 end if;
 if operation in ('update','delete','payment','split_shopping') then$new$);
  if strpos(definition, $old$ if operation in ('create','update') then
   update$old$)=0 then raise exception 'Unexpected implementation: shared_home'; end if;
  definition := replace(definition, $old$ if operation in ('create','update') then
   update$old$, $new$ if operation='create' and rotation is not null then
   for n in 1..cardinality(ids) loop
     update public.entries set rotation_members=rotation,assignee=rotation[((n-1)%cardinality(rotation))+1] where household_id=hid and id=ids[n];
   end loop;
 end if;
 if operation in ('create','update') then
   update$new$);
  execute definition;
  definition := pg_get_functiondef('public.shared_agreements_before_history(text,text,jsonb)'::regprocedure);
  if strpos(definition, $old$or jsonb_array_length(chore->'rotation')<>2$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$or jsonb_array_length(chore->'rotation')<>2$old$, $new$or jsonb_array_length(chore->'rotation')<2$new$);
  if strpos(definition, $old$rotation := array[(chore->'rotation'->>0)::uuid,(chore->'rotation'->>1)::uuid];$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$rotation := array[(chore->'rotation'->>0)::uuid,(chore->'rotation'->>1)::uuid];$old$, $new$rotation := array(select value::uuid from jsonb_array_elements_text(chore->'rotation'));$new$);
  if strpos(definition, $old$rotation[1] is null or rotation[2] is null or rotation[1]=rotation[2] or not (rotation <@ real_members)$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$rotation[1] is null or rotation[2] is null or rotation[1]=rotation[2] or not (rotation <@ real_members)$old$, $new$array_position(rotation,null) is not null or cardinality(rotation)<>(select count(distinct x) from unnest(rotation) x) or not (rotation <@ real_members) or not (real_members <@ rotation)$new$);
  if strpos(definition, $old$Each chore rotates between your two housemates.$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$Each chore rotates between your two housemates.$old$, $new$Each agreement chore rotates through every current housemate.$new$);
  if strpos(definition, $old$rotation[(w%2)+1]$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$rotation[(w%2)+1]$old$, $new$rotation[(w%cardinality(rotation))+1]$new$);
  if strpos(definition, $old$    if (payload->>'approve')::boolean then
      update$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$    if (payload->>'approve')::boolean then
      update$old$, $new$    if actor_uid=any(am.approved_by) then raise exception 'You already approved this amendment'; end if;
    if (payload->>'approve')::boolean then
      update public.agreement_amendments set approved_by=array_append(approved_by,actor_uid) where id=am.id returning * into am;
      if not (real_members <@ (am.approved_by||am.proposed_by)) then
        return jsonb_build_object('amendment',to_jsonb(am));
      end if;
      update$new$);
  if strpos(definition, $old$    if payload->>'kind' in ('swap','skip_cover') then$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$    if payload->>'kind' in ('swap','skip_cover') then$old$, $new$    if payload->>'kind' in ('swap','skip_cover') then
      if nullif(item->>'recipient','') is null and cardinality(real_members)=2 then
        item:=item||jsonb_build_object('recipient',case when real_members[1]=actor_uid then real_members[2] else real_members[1] end);
      end if;
      if nullif(item->>'recipient','') is null or (item->>'recipient')::uuid=actor_uid or not ((item->>'recipient')::uuid=any(real_members)) then
        raise exception 'Choose a different current housemate for this request';
      end if;$new$);
  if strpos(definition, $old$kind='task') then
          raise exception 'One of those chores$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$kind='task') then
          raise exception 'One of those chores$old$, $new$kind='task' and not done and (assignee=actor_uid or (payload->>'kind'='swap' and assignee=(item->>'recipient')::uuid))) then
          raise exception 'One of those chores$new$);
  if strpos(definition, $old$    if ev.actor=actor_uid then$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$    if ev.actor=actor_uid then$old$, $new$    if ev.kind in ('swap','skip_cover') and ev.details->>'recipient' is distinct from actor_uid::text then raise exception 'Only the selected housemate can answer this request'; end if;
    if ev.actor=actor_uid then$new$);
  if strpos(definition, $old$assignee=case when assignee=real_members[1] then real_members[2] else real_members[1] end$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$assignee=case when assignee=real_members[1] then real_members[2] else real_members[1] end$old$, $new$assignee=case when assignee=ev.actor then actor_uid else ev.actor end$new$);
  if strpos(definition, $old$where id=eid::uuid and household_id=hid and kind='task';
        end loop;$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$where id=eid::uuid and household_id=hid and kind='task';
        end loop;$old$, $new$where id=eid::uuid and household_id=hid and kind='task' and not done and
              (assignee=ev.actor or (ev.kind='swap' and assignee=actor_uid));
          if not found then raise exception 'This chore assignment changed; send a new request'; end if;
        end loop;$new$);
  execute definition;
  definition := pg_get_functiondef('public.shared_agreements_before_history(text,text,jsonb)'::regprocedure);
  if strpos(definition, $old$    if (payload->>'accept')::boolean then
      if ev.kind='swap' then$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$    if (payload->>'accept')::boolean then
      if ev.kind='swap' then$old$, $new$    if actor_uid=any(ev.accepted_by) then raise exception 'You already accepted this request'; end if;
    if (payload->>'accept')::boolean then
      if ev.kind='reschedule' then
        update public.agreement_events set accepted_by=array_append(accepted_by,actor_uid) where id=ev.id returning * into ev;
        if not (real_members <@ (ev.accepted_by||ev.actor)) then return jsonb_build_object('event',to_jsonb(ev)); end if;
      end if;
      if ev.kind='swap' then$new$);
  execute definition;
  definition := pg_get_functiondef('public.shared_agreements_legacy(text,text,jsonb)'::regprocedure);
  if strpos(definition, $old$when 'approved' then 'approved' else 'declined' end$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_legacy'; end if;
  definition := replace(definition, $old$when 'approved' then 'approved' else 'declined' end$old$, $new$when 'approved' then 'approved' when 'open' then 'recorded' else 'declined' end$new$);
  if strpos(definition, $old$case when operation='event_decide' then result->'event'->>'status'$old$)=0 then raise exception 'Unexpected implementation: shared_agreements_legacy'; end if;
  definition := replace(definition, $old$case when operation='event_decide' then result->'event'->>'status'$old$, $new$case when operation='event_decide' then case when result->'event'->>'status'='open' then 'recorded' else result->'event'->>'status' end$new$);
  execute definition;
  definition := pg_get_functiondef('public.shared_household_ops_v021(text,text,jsonb)'::regprocedure);
  if strpos(definition, $old$cardinality(rotation)<>2$old$)=0 then raise exception 'Unexpected implementation: shared_household_ops_v021'; end if;
  definition := replace(definition, $old$cardinality(rotation)<>2$old$, $new$cardinality(rotation)<2 or not (rotation <@ array(select user_id from public.members where household_id=hid and active and name<>'Housemates'))$new$);
  if strpos(definition, $old$rotation[(((day-s.anchor_date)/7)%2)+1]$old$)=0 then raise exception 'Unexpected implementation: shared_household_ops_v021'; end if;
  definition := replace(definition, $old$rotation[(((day-s.anchor_date)/7)%2)+1]$old$, $new$rotation[(((day-s.anchor_date)/7)%cardinality(rotation))+1]$new$);
  execute definition;
  definition := pg_get_functiondef('public.shared_household_ops(text,text,jsonb)'::regprocedure);
  if strpos(definition, $old$'schema_version','026'$old$)=0 then raise exception 'Unexpected implementation: shared_household_ops'; end if;
  definition := replace(definition, $old$'schema_version','026'$old$, $new$'schema_version','027'$new$);
  execute definition;
end $upgrade$;
commit;
