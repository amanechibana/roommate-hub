begin;
create table public.member_accounts (
  member_id uuid primary key references public.members(user_id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  foreign key (household_id, member_id) references public.members(household_id, user_id)
);
create index member_accounts_household on public.member_accounts(household_id);
alter table public.member_accounts enable row level security;
revoke all on public.member_accounts from public, anon, authenticated;
commit;
