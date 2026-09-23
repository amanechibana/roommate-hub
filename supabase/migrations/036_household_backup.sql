begin;
create function public.shared_household_backup(access_token text,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; actor uuid; owner uuid; table_name text; rows jsonb; result jsonb:='{}'::jsonb; input_rows jsonb; count_rows integer:=0;
begin
  hid:=public.coordination_identity(access_token,payload->>'actor');
  actor:=nullif(payload->>'actor','')::uuid;
  select owner_id into owner from public.households where id=hid;
  if actor is null or actor<>owner or not exists(select 1 from public.members where household_id=hid and user_id=actor and active) then raise exception 'Only the owner can back up or restore household data'; end if;
  if operation not in ('export','restore') then raise exception 'Invalid backup operation'; end if;
  if operation='restore' and (payload->>'household_id')::uuid<>hid then raise exception 'This backup belongs to another household'; end if;
  foreach table_name in array array[
    'entries','household_expenses','house_handbook_entries','house_resources','house_bookings','house_checkins','house_decisions','house_moves',
    'house_polls','house_poll_votes','house_pantry','house_maintenance','house_maintenance_updates','house_meals','house_budget_targets','house_budget_expenses',
    'house_expense_rules','house_expense_drafts','house_list_order','household_preferences','member_reminders','agreements','agreement_amendments','agreement_events','gym_logs'
  ] loop
    if operation='export' then
      execute format('select coalesce(jsonb_agg(t),''[]''::jsonb) from public.%I t where household_id=$1%s',table_name,
        case when table_name='entries' then ' and (coalesce(visibility,''household'')<>''private'' or created_by=$2)' else '' end)
        into rows using hid,actor;
      result:=result||jsonb_build_object(table_name,rows);
    else
      input_rows:=payload->'tables'->table_name;
      if jsonb_typeof(input_rows)<>'array' or jsonb_array_length(input_rows)>10000 then raise exception 'Invalid backup table: %',table_name; end if;
      if exists(select 1 from jsonb_array_elements(input_rows) r where r->>'household_id' is distinct from hid::text) then raise exception 'Backup contains another household'; end if;
      execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I,$1) on conflict do nothing',table_name,table_name) using input_rows;
      get diagnostics count_rows = row_count;
      result:=result||jsonb_build_object(table_name,count_rows);
    end if;
  end loop;
  if operation='export' then
    return jsonb_build_object('format','common-ground-household','version',1,'household_id',hid,'exported_at',now(),
      'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'name',name)),'[]'::jsonb) from public.members where household_id=hid),
      'tables',result);
  end if;
  return jsonb_build_object('restored',result);
end $$;
revoke all on function public.shared_household_backup(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_household_backup(text,text,jsonb) to anon;
do $version$
declare r record;
begin
  for r in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='shared_household_ops'
  loop
    execute replace(pg_get_functiondef(r.oid),r.prosrc,replace(r.prosrc,
      '''schema_version'',''029''','''schema_version'',''036'''));
  end loop;
end $version$;
commit;
