-- Device identity is attribution only; the household code remains the only auth.
begin;
do $$ declare hid uuid; person_id uuid; person_name text; begin
  select household_id into hid from public.shared_home_config;
  if hid is null then raise exception 'Configure shared access first'; end if;
  foreach person_name in array array['Amane', 'Barnatt'] loop
    if not exists(select 1 from public.members where household_id=hid and lower(name)=lower(person_name)) then
      person_id := gen_random_uuid();
      insert into auth.users(id) values(person_id);
      insert into public.members(user_id,household_id,name) values(person_id,hid,person_name);
    end if;
  end loop;
end $$;

create or replace function public.shared_home(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; owner_uid uuid; row_data public.entries; affected integer; n integer; person_id uuid;
  step interval; until_date date; occurrence date; sid uuid; actor_uid uuid; created_rows jsonb := '[]'::jsonb;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash = encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode = '42501'; end if;
  select owner_id into owner_uid from public.households where id=hid;
  if operation not in ('attempt', 'get') then
    actor_uid := nullif(payload->>'actor','')::uuid;
    if not exists(select 1 from public.members where household_id=hid and user_id=actor_uid and name <> 'Housemates') then
      raise exception 'Choose a household member' using errcode = '42501';
    end if;
  end if;
  if operation = 'attempt' then
    if coalesce(length(payload->>'fingerprint'),0) <> 64 then raise exception 'Invalid fingerprint'; end if;
    delete from public.shared_login_attempts where started_at < now() - interval '15 minutes';
    insert into public.shared_login_attempts(fingerprint) values(payload->>'fingerprint')
      on conflict(fingerprint) do update set attempts=public.shared_login_attempts.attempts+1
      returning attempts into n;
    return jsonb_build_object('allowed',n <= 10);
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
    if step is null or occurrence is null then
      insert into public.entries(household_id,created_by,kind,title,description,category,date,assignee,amount,url)
      values(hid,actor_uid,payload->>'kind',trim(payload->>'title'),coalesce(payload->>'description',''),payload->>'category',
        occurrence,nullif(payload->>'assignee','')::uuid,nullif(payload->>'amount','')::numeric,coalesce(payload->>'url','')) returning * into row_data;
      created_rows := created_rows || jsonb_build_array(to_jsonb(row_data));
    else
      until_date := nullif(payload->>'repeat_until','')::date;
      if until_date is null or until_date < occurrence or until_date > occurrence + interval '2 years' then
        raise exception 'Pick a repeat end date within two years.';
      end if;
      sid := gen_random_uuid(); n := 0;
      while occurrence <= until_date loop
        insert into public.entries(household_id,created_by,kind,title,description,category,date,assignee,amount,url,series_id)
        values(hid,actor_uid,payload->>'kind',trim(payload->>'title'),coalesce(payload->>'description',''),payload->>'category',
          occurrence,nullif(payload->>'assignee','')::uuid,nullif(payload->>'amount','')::numeric,coalesce(payload->>'url',''),sid) returning * into row_data;
        created_rows := created_rows || jsonb_build_array(to_jsonb(row_data));
        n := n + 1;
        occurrence := (nullif(payload->>'date','')::date + step * n)::date;
      end loop;
    end if;
  elsif operation = 'update' then
    select * into row_data from public.entries where id=(payload->>'id')::uuid and household_id=hid for update;
    if not found then raise exception 'Entry not found'; end if;
    row_data := jsonb_populate_record(row_data, payload);
    if payload->>'scope' = 'series' and row_data.series_id is not null then
      -- Shared fields change everywhere; date and done stay per-occurrence.
      update public.entries set title=row_data.title, description=row_data.description, category=row_data.category,
        assignee=row_data.assignee, amount=row_data.amount, url=row_data.url
        where series_id=row_data.series_id and household_id=hid;
      update public.entries set date=row_data.date, done=row_data.done
        where id=(payload->>'id')::uuid and household_id=hid;
    else
      update public.entries set title=row_data.title, description=row_data.description, category=row_data.category,
        date=row_data.date,assignee=row_data.assignee,amount=row_data.amount,url=row_data.url,done=row_data.done
        where id=(payload->>'id')::uuid and household_id=hid;
    end if;
  elsif operation = 'delete' then
    if payload->>'scope' = 'series' then
      delete from public.entries where household_id=hid and series_id is not null and series_id=
        (select series_id from public.entries where id=(payload->>'id')::uuid and household_id=hid);
    else
      delete from public.entries where id=(payload->>'id')::uuid and household_id=hid;
    end if;
    get diagnostics affected = row_count;
    if affected < 1 then raise exception 'Entry not found'; end if;
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
