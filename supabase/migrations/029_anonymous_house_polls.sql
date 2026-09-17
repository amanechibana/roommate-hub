begin;

-- Keep member IDs server-side for one changeable ballot per member. Every
-- gateway response, including write responses and saved polls, exposes totals
-- only. Do not return an actor's ballot: household code holders can switch actors.
do $patch$
declare r record; source text; patched integer := 0;
  original text := $old$'votes',(select coalesce(jsonb_agg(v),'[]') from public.house_poll_votes v where household_id=hid)$old$;
  anonymous text := $new$'votes',(select coalesce(jsonb_agg(v order by v.poll_id,v.choice),'[]') from (
        select poll_id,choice,count(*) as count from public.house_poll_votes
        where household_id=hid group by poll_id,choice
      ) v)$new$;
begin
  for r in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'shared_household_life%'
      and position(original in p.prosrc)>0
  loop
    source := replace(r.prosrc,original,anonymous);
    execute replace(pg_get_functiondef(r.oid),r.prosrc,source);
    patched := patched+1;
  end loop;
  if patched<>1 then raise exception 'Expected exactly one household poll snapshot to anonymize, found %',patched; end if;
end $patch$;

-- Ballot rows are never available to client database roles.
alter table public.house_poll_votes enable row level security;
revoke all on public.house_poll_votes from public,anon,authenticated;

-- Advance the readiness check without changing gateway signatures or grants.
do $version$
declare r record;
begin
  for r in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='shared_household_ops'
  loop
    execute replace(pg_get_functiondef(r.oid),r.prosrc,replace(r.prosrc,
      '''schema_version'',''028''','''schema_version'',''029'''));
  end loop;
end $version$;

commit;
