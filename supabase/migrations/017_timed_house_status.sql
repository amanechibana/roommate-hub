-- Timed plans plus multi-day away and guest entries. The existing validated
-- home gateway remains the authority; this narrow wrapper persists timing and
-- expands a bounded daily range without duplicating its bill/undo logic.
begin;

alter table public.entries
  add column end_time text
  check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table public.entries drop constraint entries_category_check;
alter table public.entries add constraint entries_category_check
  check (category in (
    'Chore','To-do','Together','Away','Guest','Quiet hours','Rent','Bill',
    'Other','Need','Want','Note','Pinned','Personal'
  ) or (kind = 'event' and category = 'Gym'));

alter function public.shared_home_before_activity(text,text,jsonb)
  rename to shared_home_before_timing;
revoke all on function public.shared_home_before_timing(text,text,jsonb)
  from public, anon, authenticated;

create function public.shared_home_before_activity(
  access_token text,
  operation text,
  payload jsonb default '{}'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
  result jsonb;
  one_result jsonb;
  created_rows jsonb := '[]'::jsonb;
  occurrence date;
  until_date date;
  sid uuid;
  saved public.entries;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;

  if operation='create' and payload->>'repeat'='daily' then
    if payload->>'kind' <> 'event' or payload->>'category' not in ('Away','Guest') then
      raise exception 'Daily ranges are only for away dates and guests';
    end if;
    occurrence := nullif(payload->>'date','')::date;
    until_date := nullif(payload->>'repeat_until','')::date;
    if occurrence is null or until_date is null or until_date < occurrence
      or until_date > occurrence + 30 then
      raise exception 'Pick an end date within 31 days';
    end if;
    sid := gen_random_uuid();
    while occurrence <= until_date loop
      one_result := public.shared_home_before_timing(
        access_token,
        'create',
        (payload - 'repeat' - 'repeat_until') || jsonb_build_object('date',occurrence)
      );
      update public.entries set
        series_id=sid,
        time_of_day=nullif(payload->>'time_of_day',''),
        end_time=nullif(payload->>'end_time','')
      where id=(one_result->'entries'->0->>'id')::uuid and household_id=hid
      returning * into saved;
      created_rows := created_rows || jsonb_build_array(to_jsonb(saved));
      occurrence := occurrence + 1;
    end loop;
    return jsonb_build_object('ok',true,'entries',created_rows);
  end if;

  result := public.shared_home_before_timing(access_token,operation,payload);
  if operation='create' then
    update public.entries e set
      time_of_day=nullif(payload->>'time_of_day',''),
      end_time=nullif(payload->>'end_time','')
    where e.household_id=hid and e.id in (
      select (item->>'id')::uuid from jsonb_array_elements(result->'entries') item
    );
    result := jsonb_set(result,'{entries}',(
      select coalesce(jsonb_agg(to_jsonb(e) order by item.ordinality),'[]'::jsonb)
      from jsonb_array_elements(result->'entries') with ordinality item(value,ordinality)
      join public.entries e on e.id=(item.value->>'id')::uuid and e.household_id=hid
    ));
  elsif operation='update' and (payload ? 'time_of_day' or payload ? 'end_time') then
    update public.entries e set
      time_of_day=case when payload ? 'time_of_day' then nullif(payload->>'time_of_day','') else e.time_of_day end,
      end_time=case when payload ? 'end_time' then nullif(payload->>'end_time','') else e.end_time end
    where e.household_id=hid and (
      e.id=(payload->>'id')::uuid or (
        payload->>'scope'='series' and e.series_id is not null and e.series_id=(
          select series_id from public.entries where id=(payload->>'id')::uuid and household_id=hid
        )
      )
    );
  end if;
  return result;
end $$;

revoke all on function public.shared_home_before_activity(text,text,jsonb)
  from public, anon, authenticated;
commit;
