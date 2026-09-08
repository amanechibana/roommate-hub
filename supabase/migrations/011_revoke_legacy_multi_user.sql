-- The pre-shared-code multi-user surface (001) is dead: the anon-key gateway
-- functions are security definer and need no caller grants, so nothing signed
-- in as `authenticated` should reach these functions or tables anymore.
begin;
revoke execute on function public.rotate_invite(), public.create_household(text,text), public.join_household(text,text) from public, authenticated;
revoke all on public.households, public.members, public.entries from authenticated;
commit;
