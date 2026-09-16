begin;
alter table public.house_activity drop constraint house_activity_action_check;
alter table public.house_activity add constraint house_activity_action_check check (
  action in ('completed','bought','reopened','paid','noted','proposed','signed','withdrew','approved','declined','requested','accepted','recorded','added','edited','removed','attached')
);

alter function public.shared_agreements(text,text,jsonb) rename to shared_agreements_before_history;
revoke all on function public.shared_agreements_before_history(text,text,jsonb) from public,anon,authenticated;
create function public.shared_agreements(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; hid uuid; verb text; label text;
begin
  result := public.shared_agreements_before_history(access_token,operation,payload);
  if operation in ('propose','sign','revoke') then
    verb := case operation when 'propose' then 'proposed' when 'sign' then 'signed' else 'withdrew' end;
    label := result->'agreement'->>'title';
  elsif operation in ('amend','amend_decide','amend_withdraw') then
    verb := case operation when 'amend' then 'proposed' when 'amend_withdraw' then 'withdrew'
      else case result->'amendment'->>'status' when 'approved' then 'approved' else 'declined' end end;
    label := 'Amendment: ' || (result->'amendment'->>'title');
  elsif operation in ('event','event_decide') then
    verb := case when operation='event_decide' then result->'event'->>'status'
      when result->'event'->>'status'='open' then 'requested' else 'recorded' end;
    label := case result->'event'->>'kind' when 'swap' then 'Chore swap' when 'skip_cover' then 'Chore cover'
      when 'skip_rollover' then 'Chore rollover' when 'reschedule' then 'Gym reschedule'
      when 'pto' then 'Gym PTO' when 'sick' then 'Sick day' else 'Repaid chore cover' end;
  end if;
  if verb is not null then
    select household_id into hid from public.shared_home_config
      where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
    insert into public.house_activity(household_id,actor,action,title) values(hid,(payload->>'actor')::uuid,verb,label);
  end if;
  return result;
end $$;
revoke all on function public.shared_agreements(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_agreements(text,text,jsonb) to anon;

alter function public.shared_handbook(text,text,jsonb) rename to shared_handbook_before_history;
revoke all on function public.shared_handbook_before_history(text,text,jsonb) from public,anon,authenticated;
create function public.shared_handbook(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; hid uuid; verb text; label text;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if operation='delete' then select title into label from public.house_handbook_entries where household_id=hid and id=(payload->>'id')::uuid; end if;
  result := public.shared_handbook_before_history(access_token,operation,payload);
  verb := case operation when 'create' then 'added' when 'update' then 'edited' when 'delete' then 'removed'
    when 'attach' then 'attached' when 'remove_file' then 'removed' end;
  if verb is not null then
    -- Record titles and filenames only; Wi-Fi passwords and private notes stay out of the feed.
    label := coalesce(label,result->'entry'->>'title',result->'file'->>'file_name');
    insert into public.house_activity(household_id,actor,action,title)
      values(hid,(payload->>'actor')::uuid,verb,'Handbook: ' || label);
  end if;
  return result;
end $$;
revoke all on function public.shared_handbook(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_handbook(text,text,jsonb) to anon;

alter function public.shared_home_before_activity(text,text,jsonb) rename to shared_home_before_custom_recurrence;
revoke all on function public.shared_home_before_custom_recurrence(text,text,jsonb) from public,anon,authenticated;
create function public.shared_home_before_activity(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare hid uuid; first_date date; last_date date; occurrence date; sid uuid; one_result jsonb; saved public.entries;
  rows jsonb := '[]'; days integer[]; every_n integer; n integer := 0; partner uuid; rotation uuid[] := '{}'; step interval;
begin
  if operation <> 'create' or not (coalesce(payload->>'repeat','')='weekdays' or coalesce((payload->>'repeat_interval')::integer,1) <> 1) then
    return public.shared_home_before_custom_recurrence(access_token,operation,payload);
  end if;
  select household_id into hid from public.shared_home_config
    where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  if payload->>'kind' not in ('task','event') then raise exception 'Only to-dos and events can repeat'; end if;
  first_date := nullif(payload->>'date','')::date; last_date := nullif(payload->>'repeat_until','')::date;
  every_n := coalesce((payload->>'repeat_interval')::integer,1);
  if first_date is null or last_date is null or last_date < first_date or last_date > first_date + interval '2 years'
    or every_n not between 1 and 52 then raise exception 'Choose a valid interval and an end date within two years'; end if;
  if payload->>'repeat'='weekdays' then
    if jsonb_typeof(payload->'repeat_days') is distinct from 'array' then raise exception 'Choose at least one weekday'; end if;
    days := array(select distinct value::integer from jsonb_array_elements_text(payload->'repeat_days'));
    if cardinality(days)=0 or exists(select 1 from unnest(days) d where d not between 0 and 6) then raise exception 'Choose valid weekdays'; end if;
  else
    step := case payload->>'repeat' when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' when 'monthly' then interval '1 month' end;
    if step is null then raise exception 'Unknown repeat'; end if;
  end if;
  partner := nullif(payload->>'rotation_partner','')::uuid;
  if partner is not null then
    if payload->>'kind'<>'task' or nullif(payload->>'assignee','') is null or partner=(payload->>'assignee')::uuid
      or not exists(select 1 from public.members where household_id=hid and user_id=partner and name<>'Housemates')
      or not exists(select 1 from public.members where household_id=hid and user_id=(payload->>'assignee')::uuid and name<>'Housemates') then
      raise exception 'Choose two different housemates for a recurring chore'; end if;
    rotation := array[(payload->>'assignee')::uuid,partner];
  end if;
  sid := gen_random_uuid(); occurrence := first_date;
  while occurrence <= last_date loop
    if step is not null or (extract(dow from occurrence)::integer=any(days)
      and ((occurrence-date_trunc('week',first_date::timestamp)::date)/7) % every_n=0) then
      one_result := public.shared_home_before_custom_recurrence(access_token,'create',
        (payload-'repeat'-'repeat_until'-'repeat_days'-'repeat_interval'-'rotation_partner') || jsonb_build_object(
          'date',occurrence,'assignee',case when partner is not null then rotation[(n % 2)+1]::text else payload->>'assignee' end));
      update public.entries set series_id=sid,rotation_members=rotation
        where household_id=hid and id=(one_result->'entries'->0->>'id')::uuid returning * into saved;
      rows := rows || jsonb_build_array(to_jsonb(saved)); n := n+1;
    end if;
    occurrence := case when step is null then occurrence+1 else (first_date+step*every_n*n)::date end;
  end loop;
  if n=0 then raise exception 'No selected weekdays fall within these dates'; end if;
  return jsonb_build_object('ok',true,'entries',rows);
end $$;
revoke all on function public.shared_home_before_activity(text,text,jsonb) from public,anon,authenticated;
commit;
