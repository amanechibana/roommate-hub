begin;
create table public.edit_undo_batches (
  id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
  actor uuid not null, surface text not null check(surface in ('home','expenses')),
  before_rows jsonb not null, after_rows jsonb not null,
  expires_at timestamptz not null default clock_timestamp()+interval '30 seconds'
);
alter table public.edit_undo_batches enable row level security;
revoke all on public.edit_undo_batches from public,anon,authenticated;

alter function public.shared_home(text,text,jsonb) rename to shared_home_before_edit_undo;
revoke all on function public.shared_home_before_edit_undo(text,text,jsonb) from public,anon,authenticated;
create function public.shared_home(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; actor_uid uuid; result jsonb; before_data jsonb; after_data jsonb; batch public.edit_undo_batches;
begin
  if operation not in ('update','undo_edit') or (operation='update' and not payload ? 'undo_token') then
    return public.shared_home_before_edit_undo(access_token,operation,payload);
  end if;
  select household_id into hid from public.shared_home_config where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  actor_uid := nullif(payload->>'actor','')::uuid;
  if not exists(select 1 from public.members where household_id=hid and user_id=actor_uid and name<>'Housemates') then
    raise exception 'Choose a household member' using errcode='42501'; end if;
  if operation='update' then
    perform e.id from public.entries e where e.household_id=hid and (e.id=(payload->>'id')::uuid or (payload->>'scope'='series' and e.series_id is not null and e.series_id=(select series_id from public.entries where household_id=hid and id=(payload->>'id')::uuid))) order by e.id for update;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into before_data from public.entries e where e.household_id=hid and (e.id=(payload->>'id')::uuid or (payload->>'scope'='series' and e.series_id is not null and e.series_id=(select series_id from public.entries where household_id=hid and id=(payload->>'id')::uuid)));
    result := public.shared_home_before_edit_undo(access_token,operation,payload-'undo_token');
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into after_data from public.entries e
      where e.household_id=hid and e.id in (select (value->>'id')::uuid from jsonb_array_elements(before_data));
    delete from public.edit_undo_batches where expires_at<clock_timestamp();
    insert into public.edit_undo_batches(id,household_id,actor,surface,before_rows,after_rows)
      values((payload->>'undo_token')::uuid,hid,actor_uid,'home',before_data,after_data);
    return result;
  end if;
  select * into batch from public.edit_undo_batches where id=(payload->>'undo_token')::uuid
    and household_id=hid and actor=actor_uid and surface='home' and expires_at>clock_timestamp() for update;
  if not found then raise exception 'This edit can no longer be undone'; end if;
  perform e.id from public.entries e where e.household_id=hid and e.id in
    (select (value->>'id')::uuid from jsonb_array_elements(batch.after_rows)) order by e.id for update;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into after_data from public.entries e where e.household_id=hid
    and e.id in (select (value->>'id')::uuid from jsonb_array_elements(batch.after_rows));
  if after_data is distinct from batch.after_rows then raise exception 'Someone changed this record since your edit. Open it to review the latest version'; end if;
  update public.entries e set kind=old.kind,title=old.title,description=old.description,category=old.category,date=old.date,time_of_day=old.time_of_day,end_time=old.end_time,assignee=old.assignee,amount=old.amount,url=old.url,done=old.done,payment_members=old.payment_members,paid_by=old.paid_by
    from jsonb_populate_recordset(null::public.entries,batch.before_rows) old where e.household_id=hid and e.id=old.id;
  delete from public.edit_undo_batches where id=batch.id;
  return public.shared_home_before_edit_undo(access_token,'get',jsonb_build_object('actor',actor_uid))
    || jsonb_build_object('restored',batch.before_rows);
end $$;
revoke all on function public.shared_home(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_home(text,text,jsonb) to anon;

alter function public.shared_expenses(text,text,jsonb) rename to shared_expenses_before_edit_undo;
revoke all on function public.shared_expenses_before_edit_undo(text,text,jsonb) from public,anon,authenticated;
create function public.shared_expenses(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; actor_uid uuid; result jsonb; before_data jsonb; after_data jsonb; batch public.edit_undo_batches;
begin
  if operation not in ('update','undo_edit') or (operation='update' and not payload ? 'undo_token') then
    return public.shared_expenses_before_edit_undo(access_token,operation,payload);
  end if;
  select household_id into hid from public.shared_home_config where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  actor_uid := nullif(payload->>'actor','')::uuid;
  if not exists(select 1 from public.members where household_id=hid and user_id=actor_uid and name<>'Housemates') then
    raise exception 'Choose a household member' using errcode='42501'; end if;
  if operation='update' then
    perform e.id from public.household_expenses e where e.household_id=hid and e.id=(payload->>'id')::uuid order by e.id for update;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into before_data from public.household_expenses e where e.household_id=hid and e.id=(payload->>'id')::uuid;
    result := public.shared_expenses_before_edit_undo(access_token,operation,payload-'undo_token');
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into after_data from public.household_expenses e
      where e.household_id=hid and e.id in (select (value->>'id')::uuid from jsonb_array_elements(before_data));
    delete from public.edit_undo_batches where expires_at<clock_timestamp();
    insert into public.edit_undo_batches(id,household_id,actor,surface,before_rows,after_rows)
      values((payload->>'undo_token')::uuid,hid,actor_uid,'expenses',before_data,after_data);
    return result;
  end if;
  select * into batch from public.edit_undo_batches where id=(payload->>'undo_token')::uuid
    and household_id=hid and actor=actor_uid and surface='expenses' and expires_at>clock_timestamp() for update;
  if not found then raise exception 'This edit can no longer be undone'; end if;
  perform e.id from public.household_expenses e where e.household_id=hid and e.id in
    (select (value->>'id')::uuid from jsonb_array_elements(batch.after_rows)) order by e.id for update;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into after_data from public.household_expenses e where e.household_id=hid
    and e.id in (select (value->>'id')::uuid from jsonb_array_elements(batch.after_rows));
  if after_data is distinct from batch.after_rows then raise exception 'Someone changed this record since your edit. Open it to review the latest version'; end if;
  update public.household_expenses e set kind=old.kind,title=old.title,date=old.date,amount_cents=old.amount_cents,paid_by=old.paid_by,shares=old.shares,recipient=old.recipient
    from jsonb_populate_recordset(null::public.household_expenses,batch.before_rows) old where e.household_id=hid and e.id=old.id;
  delete from public.edit_undo_batches where id=batch.id;
  return public.shared_expenses_before_edit_undo(access_token,'get',jsonb_build_object('actor',actor_uid))
    || jsonb_build_object('restored',batch.before_rows);
end $$;
revoke all on function public.shared_expenses(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_expenses(text,text,jsonb) to anon;
commit;
