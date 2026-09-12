-- A pinned note is a note whose category is 'Pinned'; the check from 005 has to allow it.
begin;
alter table public.entries drop constraint entries_category_check;
alter table public.entries add constraint entries_category_check
  check (category in ('Chore','To-do','Together','Rent','Bill','Other','Need','Want','Note','Pinned'));
commit;
