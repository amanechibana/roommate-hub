begin;
create table public.member_enrollments (
  member_id uuid primary key references public.members(user_id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_by uuid not null references public.members(user_id),
  foreign key(household_id,member_id) references public.members(household_id,user_id)
);
alter table public.member_enrollments enable row level security;
revoke all on public.member_enrollments from public,anon,authenticated;
do $version$
declare r record;
begin
  for r in select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='shared_household_ops' loop
    execute replace(pg_get_functiondef(r.oid),r.prosrc,replace(r.prosrc,
      '''schema_version'',''036''','''schema_version'',''037'''));
  end loop;
end $version$;
commit;
