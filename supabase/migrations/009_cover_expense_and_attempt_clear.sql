-- One redefinition, two changes: covering a bill can atomically write its
-- ledger expense, and successful sign-ins can clear their rate-limit row.
begin;
create or replace function public.shared_home(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; owner_uid uuid; row_data public.entries; affected integer; n integer; person_id uuid;
  step interval; until_date date; occurrence date; sid uuid; actor_uid uuid; created_rows jsonb := '[]'::jsonb;
  rotation uuid[] := '{}'; payers uuid[] := '{}'; partner uuid; token uuid; deleted_rows jsonb; was_bill boolean; now_bill boolean;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash = encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode = '42501'; end if;
  select owner_id into owner_uid from public.households where id=hid;
  if operation not in ('attempt', 'attempt_clear', 'get') then
    actor_uid := nullif(payload->>'actor','')::uuid;
    if not exists(select 1 from public.members where household_id=hid and user_id=actor_uid and name <> 'Housemates') then
      raise exception 'Choose a household member' using errcode = '42501';
    end if;
  end if;
  delete from public.deleted_entry_batches where expires_at <= now();
  if operation = 'attempt' then
    if coalesce(length(payload->>'fingerprint'),0) <> 64 then raise exception 'Invalid fingerprint'; end if;
    delete from public.shared_login_attempts where started_at < now() - interval '15 minutes';
    insert into public.shared_login_attempts(fingerprint) values(payload->>'fingerprint')
      on conflict(fingerprint) do update set attempts=public.shared_login_attempts.attempts+1
      returning attempts into n;
    return jsonb_build_object('allowed',n <= 10);
  elsif operation = 'attempt_clear' then
    -- Roommates share a NAT IP; successful sign-ins must not count toward the lockout.
    if coalesce(length(payload->>'fingerprint'),0) <> 64 then raise exception 'Invalid fingerprint'; end if;
    delete from public.shared_login_attempts where fingerprint=payload->>'fingerprint';
    return jsonb_build_object('ok',true);
  elsif operation = 'get' then
    return jsonb_build_object(
      'household',(select to_jsonb(h) from public.households h where id=hid),
      'members',(select coalesce(jsonb_agg(m order by m.name),'[]') from public.members m where household_id=hid),
      'entries',(select coalesce(jsonb_agg(e order by e.created_at desc),'[]') from public.entries e where household_id=hid)
    );
  elsif operation = 'create' then
    occurrence := nullif(payload->>'date','')::date;
    step := case payload->>'repeat' when 'weekly' then interval '7 days'
      when 'biweekly' then interval '14 days' when 'monthly' then interval '1 month' end;
    if payload->>'repeat' is not null and step is null then raise exception 'Unknown repeat'; end if;
    partner := nullif(payload->>'rotation_partner','')::uuid;
    if partner is not null then
      if payload->>'kind' <> 'task' or step is null or occurrence is null
        or nullif(payload->>'assignee','') is null or partner=(payload->>'assignee')::uuid
        or not exists(select 1 from public.members where household_id=hid and user_id=partner and name <> 'Housemates')
        or not exists(select 1 from public.members where household_id=hid and user_id=(payload->>'assignee')::uuid and name <> 'Housemates') then
        raise exception 'Choose two different housemates for a recurring chore';
      end if;
      rotation := array[(payload->>'assignee')::uuid,partner];
    end if;
    if payload->>'kind'='event' and payload->>'category' in ('Rent','Bill') then
      payers := array(select user_id from public.members where household_id=hid and name <> 'Housemates' order by name,user_id);
    end if;
    if step is null or occurrence is null then
      insert into public.entries(household_id,created_by,kind,title,description,category,date,assignee,amount,url,payment_members)
      values(hid,actor_uid,payload->>'kind',trim(payload->>'title'),coalesce(payload->>'description',''),payload->>'category',
        occurrence,nullif(payload->>'assignee','')::uuid,nullif(payload->>'amount','')::numeric,coalesce(payload->>'url',''),payers) returning * into row_data;
      created_rows := created_rows || jsonb_build_array(to_jsonb(row_data));
    else
      until_date := nullif(payload->>'repeat_until','')::date;
      if until_date is null or until_date < occurrence or until_date > occurrence + interval '2 years' then
        raise exception 'Pick a repeat end date within two years.';
      end if;
      sid := gen_random_uuid(); n := 0;
      while occurrence <= until_date loop
        insert into public.entries(household_id,created_by,kind,title,description,category,date,assignee,amount,url,series_id,rotation_members,payment_members)
        values(hid,actor_uid,payload->>'kind',trim(payload->>'title'),coalesce(payload->>'description',''),payload->>'category',
          occurrence,case when cardinality(rotation)>0 then rotation[(n % cardinality(rotation))+1] else nullif(payload->>'assignee','')::uuid end,nullif(payload->>'amount','')::numeric,coalesce(payload->>'url',''),sid,rotation,payers) returning * into row_data;
        created_rows := created_rows || jsonb_build_array(to_jsonb(row_data));
        n := n + 1;
        occurrence := (nullif(payload->>'date','')::date + step * n)::date;
      end loop;
    end if;
  elsif operation = 'update' then
    select * into row_data from public.entries where id=(payload->>'id')::uuid and household_id=hid for update;
    if not found then raise exception 'Entry not found'; end if;
    was_bill := row_data.kind='event' and row_data.category in ('Rent','Bill');
    row_data := jsonb_populate_record(row_data, payload);
    now_bill := row_data.kind='event' and row_data.category in ('Rent','Bill');
    -- Entering or leaving bill status manages payments; leaving must not discard paid records.
    if was_bill and not now_bill then
      if exists(
        select 1 from public.entries e where household_id=hid and cardinality(e.paid_by)>0 and
          (e.id=row_data.id or (payload->>'scope'='series' and e.series_id=row_data.series_id))
      ) then raise exception 'Clear paid checks before changing this bill to another category'; end if;
      update public.entries e set payment_members='{}'::uuid[]
        where household_id=hid and (e.id=row_data.id or (payload->>'scope'='series' and e.series_id=row_data.series_id));
    elsif now_bill and not was_bill then
      payers := array(select user_id from public.members where household_id=hid and name <> 'Housemates' order by name,user_id);
      update public.entries e set payment_members=case when cardinality(e.payment_members)>0 then e.payment_members else payers end
        where household_id=hid and (e.id=row_data.id or (payload->>'scope'='series' and e.series_id=row_data.series_id));
    end if;
    if payload->>'scope' = 'series' and row_data.series_id is not null then
      -- Shared fields change everywhere; date and done stay per-occurrence.
      update public.entries set kind=row_data.kind, title=row_data.title, description=row_data.description, category=row_data.category,
        assignee=case when cardinality(rotation_members)>0 then assignee else row_data.assignee end, amount=row_data.amount, url=row_data.url
        where series_id=row_data.series_id and household_id=hid;
      update public.entries set date=row_data.date, done=row_data.done
        where id=(payload->>'id')::uuid and household_id=hid;
    else
      update public.entries set kind=row_data.kind, title=row_data.title, description=row_data.description, category=row_data.category,
        date=row_data.date,assignee=row_data.assignee,amount=row_data.amount,url=row_data.url,done=row_data.done
        where id=(payload->>'id')::uuid and household_id=hid;
    end if;
  elsif operation = 'payment' then
    select * into row_data from public.entries where id=(payload->>'id')::uuid and household_id=hid for update;
    if not found or row_data.kind <> 'event' or row_data.category not in ('Rent','Bill') or not (actor_uid=any(row_data.payment_members)) then
      raise exception 'This bill is not assigned to you';
    end if;
    if jsonb_typeof(payload->'cover')='boolean' and (payload->>'cover')::boolean then
      update public.entries set paid_by=payment_members where id=row_data.id;
      -- The ledger entry rides the same transaction: shared_expenses re-validates
      -- everything and is idempotent on id, and a raise there rolls back the
      -- payment too, so cover-plus-expense is all or nothing.
      if jsonb_typeof(payload->'expense')='object' then
        perform public.shared_expenses(access_token,'create',(payload->'expense') || jsonb_build_object('actor',payload->>'actor'));
      end if;
    else
      if jsonb_typeof(payload->'paid') is distinct from 'boolean' then raise exception 'Choose paid or unpaid'; end if;
      update public.entries set paid_by=case when (payload->>'paid')::boolean then
        case when actor_uid=any(paid_by) then paid_by else array_append(paid_by,actor_uid) end
        else array_remove(paid_by,actor_uid) end where id=row_data.id;
    end if;
  elsif operation = 'delete' then
    token := coalesce(nullif(payload->>'undo_token','')::uuid,gen_random_uuid());
    with removed as (
      delete from public.entries where household_id=hid and
        case when payload->>'scope'='series' then series_id is not null and series_id=
          (select series_id from public.entries where id=(payload->>'id')::uuid and household_id=hid)
        else id=(payload->>'id')::uuid end returning *
    ) select jsonb_agg(to_jsonb(removed) order by date,id) into deleted_rows from removed;
    if deleted_rows is null then raise exception 'Entry not found'; end if;
    insert into public.deleted_entry_batches(id,household_id,deleted_by,entries) values(token,hid,actor_uid,deleted_rows);
  elsif operation = 'restore' then
    delete from public.deleted_entry_batches where id=(payload->>'undo_token')::uuid
      and household_id=hid and deleted_by=actor_uid and expires_at>now() returning entries into deleted_rows;
    if not found then raise exception 'Undo is no longer available'; end if;
    insert into public.entries select * from jsonb_populate_recordset(null::public.entries,deleted_rows);
    created_rows := deleted_rows;
  elsif operation = 'member' then
    person_id := gen_random_uuid();
    insert into auth.users(id) values(person_id);
    insert into public.members(user_id,household_id,name) values(person_id,hid,trim(payload->>'name'));
  else raise exception 'Unknown operation';
  end if;
  return jsonb_build_object('ok',true,'entries',created_rows);
end $$;
revoke all on function public.shared_home(text,text,jsonb) from public, authenticated;
grant execute on function public.shared_home(text,text,jsonb) to anon;
commit;
