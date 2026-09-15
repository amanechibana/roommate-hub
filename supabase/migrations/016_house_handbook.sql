-- Structured household reference information and private file attachments.
begin;

create table public.house_handbook_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  section text not null check (section in ('wifi','contacts','trash','appliances','other')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  value text not null default '' check (char_length(value) <= 4000),
  notes text not null default '' check (char_length(notes) <= 4000),
  sort_order smallint not null default 0 check (sort_order between 0 and 1000),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, created_by) references public.members(household_id, user_id),
  foreign key (household_id, updated_by) references public.members(household_id, user_id)
);
create index house_handbook_entries_order
  on public.house_handbook_entries(household_id, section, sort_order, created_at);

create table public.house_handbook_files (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  entry_id uuid not null references public.house_handbook_entries(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 1 and 600),
  file_name text not null check (char_length(file_name) between 1 and 180),
  content_type text not null check (char_length(content_type) between 1 and 120),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (household_id, created_by) references public.members(household_id, user_id)
);
create index house_handbook_files_entry
  on public.house_handbook_files(household_id, entry_id, created_at);

alter table public.house_handbook_entries enable row level security;
alter table public.house_handbook_files enable row level security;
revoke all on public.house_handbook_entries, public.house_handbook_files
  from public, anon, authenticated;

-- Objects are accessed only through the signed-in Next.js route, which uses
-- the server-only service role after validating the household session. The
-- bucket itself stays private and caps manuals/photos at 10 MB.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'house-handbook',
  'house-handbook',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create function public.shared_handbook(access_token text, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
  actor_uid uuid;
  item public.house_handbook_entries;
  attachment public.house_handbook_files;
  removed_paths jsonb := '[]'::jsonb;
begin
  select household_id into hid from public.shared_home_config
    where gateway_hash = encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode = '42501'; end if;

  if operation = 'get' then
    return jsonb_build_object(
      'entries',(select coalesce(jsonb_agg(e order by e.section,e.sort_order,e.created_at),'[]')
        from public.house_handbook_entries e where e.household_id=hid),
      'files',(select coalesce(jsonb_agg(f order by f.created_at),'[]')
        from public.house_handbook_files f where f.household_id=hid)
    );
  elsif operation = 'file' then
    select * into attachment from public.house_handbook_files
      where id=(payload->>'id')::uuid and household_id=hid;
    if not found then raise exception 'File not found'; end if;
    return jsonb_build_object('file',to_jsonb(attachment));
  end if;

  actor_uid := nullif(payload->>'actor','')::uuid;
  if not exists(select 1 from public.members where household_id=hid and user_id=actor_uid and name <> 'Housemates') then
    raise exception 'Choose a household member' using errcode = '42501';
  end if;

  if operation = 'create' then
    insert into public.house_handbook_entries(
      household_id,section,title,value,notes,sort_order,created_by,updated_by
    ) values(
      hid,payload->>'section',trim(payload->>'title'),coalesce(payload->>'value',''),
      coalesce(payload->>'notes',''),coalesce((payload->>'sort_order')::smallint,0),actor_uid,actor_uid
    ) returning * into item;
    return jsonb_build_object('entry',to_jsonb(item));
  elsif operation = 'update' then
    update public.house_handbook_entries set
      section=payload->>'section',
      title=trim(payload->>'title'),
      value=coalesce(payload->>'value',''),
      notes=coalesce(payload->>'notes',''),
      sort_order=coalesce((payload->>'sort_order')::smallint,sort_order),
      updated_by=actor_uid,
      updated_at=now()
    where id=(payload->>'id')::uuid and household_id=hid
    returning * into item;
    if not found then raise exception 'Handbook entry not found'; end if;
    return jsonb_build_object('entry',to_jsonb(item));
  elsif operation = 'delete' then
    select coalesce(jsonb_agg(storage_path),'[]') into removed_paths
      from public.house_handbook_files
      where household_id=hid and entry_id=(payload->>'id')::uuid;
    delete from public.house_handbook_entries
      where id=(payload->>'id')::uuid and household_id=hid;
    if not found then raise exception 'Handbook entry not found'; end if;
    return jsonb_build_object('ok',true,'paths',removed_paths);
  elsif operation = 'attach' then
    if not exists(select 1 from public.house_handbook_entries where id=(payload->>'entry_id')::uuid and household_id=hid) then
      raise exception 'Handbook entry not found';
    end if;
    if (select count(*) from public.house_handbook_files where household_id=hid and entry_id=(payload->>'entry_id')::uuid) >= 20 then
      raise exception 'This handbook entry already has 20 files';
    end if;
    if (payload->>'storage_path') not like (hid::text || '/%') then
      raise exception 'Invalid storage path';
    end if;
    insert into public.house_handbook_files(
      household_id,entry_id,storage_path,file_name,content_type,size_bytes,created_by
    ) values(
      hid,(payload->>'entry_id')::uuid,payload->>'storage_path',payload->>'file_name',
      payload->>'content_type',(payload->>'size_bytes')::integer,actor_uid
    ) returning * into attachment;
    return jsonb_build_object('file',to_jsonb(attachment));
  elsif operation = 'remove_file' then
    delete from public.house_handbook_files
      where id=(payload->>'id')::uuid and household_id=hid
      returning * into attachment;
    if not found then raise exception 'File not found'; end if;
    return jsonb_build_object('file',to_jsonb(attachment));
  else
    raise exception 'Unknown operation';
  end if;
end $$;
revoke all on function public.shared_handbook(text,text,jsonb) from public, authenticated;
grant execute on function public.shared_handbook(text,text,jsonb) to anon;
commit;
