-- Gym split shift: a unilateral relief event that excuses a missed session for
-- everyone and restarts the Push/Pull/Legs rotation at the missed workout.
begin;
alter table public.agreement_events drop constraint agreement_events_kind_check;
alter table public.agreement_events add constraint agreement_events_kind_check
  check (kind in ('skip_rollover','skip_cover','swap','reschedule','pto','sick','cover_repaid','shift'));
do $upgrade$
declare definition text;
begin
  definition := pg_get_functiondef('public.shared_agreements_before_history(text,text,jsonb)'::regprocedure);
  if strpos(definition, $old$not in ('skip_rollover','skip_cover','swap','reschedule','pto','sick','cover_repaid') then$old$)=0
    or strpos(definition, $old$case when payload->>'kind' in ('pto','sick','skip_rollover','cover_repaid') then 'done' else 'open' end,$old$)=0
    or strpos(definition, $old$    elsif payload->>'kind'='skip_rollover' and entry_row.id is not null then$old$)=0 then
    raise exception 'Unexpected implementation: shared_agreements_before_history'; end if;
  definition := replace(definition, $old$not in ('skip_rollover','skip_cover','swap','reschedule','pto','sick','cover_repaid') then$old$,
    $new$not in ('skip_rollover','skip_cover','swap','reschedule','pto','sick','cover_repaid','shift') then$new$);
  definition := replace(definition, $old$case when payload->>'kind' in ('pto','sick','skip_rollover','cover_repaid') then 'done' else 'open' end,$old$,
    $new$case when payload->>'kind' in ('pto','sick','skip_rollover','cover_repaid','shift') then 'done' else 'open' end,$new$);
  -- Every later session in the series is retitled from the missed workout on,
  -- which also repairs a rotation that drifted; roll_forward continues from the new tail.
  definition := replace(definition, $old$    elsif payload->>'kind'='skip_rollover' and entry_row.id is not null then$old$, $new$    elsif payload->>'kind'='shift' then
      if ag.slug<>'gym' or entry_row.id is null or entry_row.category is distinct from 'Gym'
        or entry_row.series_id is distinct from nullif(ag.terms->>'gym_series_id','')::uuid
        or entry_row.title not in ('Push day','Pull day','Legs day') then
        raise exception 'Pick the gym session you missed.'; end if;
      w := array_position(array['Push day','Pull day','Legs day'],entry_row.title)-1;
      update public.entries x set title=(array['Push day','Pull day','Legs day'])[((w+r.k-1)%3)::int+1]
        from (select id,row_number() over (order by date,time_of_day,created_at,id) k from public.entries
          where household_id=hid and series_id=entry_row.series_id and category='Gym' and date>entry_row.date) r
        where x.id=r.id;
      get diagnostics n = row_count;
      update public.agreement_schedule_state set next_cycle=(w+n)%3 where series_id=entry_row.series_id;
    elsif payload->>'kind'='skip_rollover' and entry_row.id is not null then$new$);
  execute definition;
  definition := pg_get_functiondef('public.shared_agreements_legacy(text,text,jsonb)'::regprocedure);
  if strpos(definition, $old$when 'sick' then 'Sick day' else 'Repaid chore cover' end$old$)=0 then
    raise exception 'Unexpected implementation: shared_agreements_legacy'; end if;
  definition := replace(definition, $old$when 'sick' then 'Sick day' else 'Repaid chore cover' end$old$,
    $new$when 'sick' then 'Sick day' when 'shift' then 'Gym split shift' else 'Repaid chore cover' end$new$);
  execute definition;
end $upgrade$;
do $version$
declare r record;
begin
  for r in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='shared_household_ops' loop
    execute replace(pg_get_functiondef(r.oid),r.prosrc,replace(r.prosrc,
      '''schema_version'',''037''','''schema_version'',''038'''));
  end loop;
end $version$;
commit;
