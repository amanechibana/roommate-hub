begin;

create function public.household_today(hid uuid, at_time timestamptz default now())
returns date language sql stable security definer set search_path='' as $$
  select (at_time at time zone coalesce(
    (select settings->>'timezone' from public.household_preferences where household_id=hid),
    'America/New_York'
  ))::date;
$$;
revoke all on function public.household_today(uuid,timestamptz) from public,anon,authenticated;

-- Update the installed gateway chain without replaying historical migrations.
-- Preserve signatures, security settings and grants; initialize dates only
-- after the gateway has resolved and authorized its household.
do $patch$
declare r record; source text; revised text; initialized boolean;
  fixed_date text := '(now() at time zone ''America/New_York'')::date';
  guard text := 'if hid is null then raise exception ''Access denied'' using errcode=''42501''; end if;';
begin
  for r in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'shared_%' and
      (position(fixed_date in p.prosrc)>0 or p.prosrc ~ '\mcurrent_date\M')
  loop
    source := regexp_replace(r.prosrc,
      'today date\s*:=\s*\(now\(\) at time zone ''America/New_York''\)::date',
      'today date', 'g');
    initialized := source <> r.prosrc;
    source := replace(source,fixed_date,'public.household_today(hid)');
    source := regexp_replace(source,'\mcurrent_date\M','public.household_today(hid)','g');
    if initialized then
      if position(guard in source)>0 then
        source := replace(source,guard,guard || E'\n  today:=public.household_today(hid);');
      else
        revised := regexp_replace(source,
          '(hid\s*:=\s*public\.coordination_identity\([^;]+;)',
          E'\\1\n today:=public.household_today(hid);');
        if revised=source then raise exception 'Household date initialization point missing for %',r.oid::regprocedure; end if;
        source := revised;
      end if;
    end if;
    execute replace(pg_get_functiondef(r.oid),r.prosrc,source);
  end loop;
end $patch$;

-- Surface the installed version through the existing deployment readiness API.
do $version$
declare r record;
begin
  for r in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='shared_household_ops'
  loop
    execute replace(pg_get_functiondef(r.oid),r.prosrc,replace(r.prosrc,
      '''schema_version'',''027''','''schema_version'',''028'''));
  end loop;
end $version$;

commit;
