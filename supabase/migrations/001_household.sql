-- Run once in a fresh Supabase project's SQL editor.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  unique (household_id, user_id)
);
create index members_household_idx on public.members(household_id);
create table public.household_invites (
  household_id uuid primary key references public.households(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null
);
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('task','event','request','note')),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default '' check (category in ('Chore','To-do','Together','Rent','Other','Need','Want','Note')),
  date date,
  assignee uuid,
  amount numeric(10,2) check (amount >= 0),
  url text not null default '' check (char_length(url) <= 2048 and (url = '' or url ~ '^https?://')),
  done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (household_id, assignee) references public.members(household_id, user_id),
  check (kind <> 'event' or date is not null)
);
create index entries_household_idx on public.entries(household_id, created_at);

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.household_invites enable row level security;
alter table public.entries enable row level security;

create function public.my_household() returns uuid language sql stable security definer
set search_path = '' as $$ select household_id from public.members where user_id = auth.uid() $$;

create policy household_read on public.households for select to authenticated using (id = public.my_household());
create policy members_read on public.members for select to authenticated using (household_id = public.my_household());
create policy entries_read on public.entries for select to authenticated using (household_id = public.my_household());
create policy entries_insert on public.entries for insert to authenticated with check (household_id = public.my_household() and created_by = auth.uid());
create policy entries_update on public.entries for update to authenticated using (household_id = public.my_household()) with check (household_id = public.my_household());
create policy entries_delete on public.entries for delete to authenticated using (household_id = public.my_household());

-- No client access to invitation hashes. Only the owner may mint an invitation.
create function public.rotate_invite() returns text language plpgsql security definer set search_path = '' as $$
declare hid uuid; token text;
begin
  select id into hid from public.households where id = public.my_household() and owner_id = auth.uid();
  if hid is null then raise exception 'Only the household owner can create an invite.'; end if;
  token := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.household_invites (household_id, token_hash, expires_at)
  values (hid, encode(extensions.digest(token, 'sha256'), 'hex'), now() + interval '7 days')
  on conflict (household_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at;
  return token;
end $$;

create function public.create_household(house_name text, member_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if public.my_household() is not null then raise exception 'You already belong to a household.'; end if;
  insert into public.households (name, owner_id) values (trim(house_name), auth.uid()) returning id into hid;
  insert into public.members (user_id, household_id, name) values (auth.uid(), hid, trim(member_name));
  return hid;
end $$;

create function public.join_household(invite_code text, member_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if public.my_household() is not null then raise exception 'You already belong to a household.'; end if;
  select household_id into hid from public.household_invites
    where token_hash = encode(extensions.digest(lower(trim(invite_code)), 'sha256'), 'hex') and expires_at > now();
  if hid is null then raise exception 'This invite is invalid or expired. Ask your housemate for a new one.'; end if;
  insert into public.members (user_id, household_id, name) values (auth.uid(), hid, trim(member_name));
  return hid;
end $$;

revoke all on public.households, public.members, public.household_invites, public.entries from anon, authenticated;
grant select on public.households, public.members to authenticated;
grant select, delete on public.entries to authenticated;
grant insert (household_id,kind,title,description,category,date,assignee,amount,url,done) on public.entries to authenticated;
grant update (title,description,category,date,assignee,amount,url,done) on public.entries to authenticated;
revoke all on function public.my_household(), public.rotate_invite(), public.create_household(text,text), public.join_household(text,text) from public, anon;
grant execute on function public.my_household(), public.rotate_invite(), public.create_household(text,text), public.join_household(text,text) to authenticated;
commit;
