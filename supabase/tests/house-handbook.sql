-- Disposable database only, migrations 001–016 and test-gateway token.
begin;
do $$
declare a uuid; hid uuid; result jsonb; entry_id uuid; file_id uuid;
begin
  select household_id into hid from public.shared_home_config;
  select user_id into a from public.members where household_id=hid and name='Amane';
  result := public.shared_handbook('test-gateway','create',jsonb_build_object(
    'actor',a,'section','wifi','title','Home Wi-Fi','value','ground-floor','notes','Router by the TV'
  ));
  entry_id := (result->'entry'->>'id')::uuid;
  if not exists(select 1 from public.house_handbook_entries where id=entry_id and household_id=hid and section='wifi') then
    raise exception 'Handbook entry was not created';
  end if;
  result := public.shared_handbook('test-gateway','attach',jsonb_build_object(
    'actor',a,'entry_id',entry_id,'storage_path',hid::text || '/' || entry_id::text || '/manual.pdf',
    'file_name','manual.pdf','content_type','application/pdf','size_bytes',100
  ));
  file_id := (result->'file'->>'id')::uuid;
  if (public.shared_handbook('test-gateway','file',jsonb_build_object('id',file_id))->'file'->>'file_name') <> 'manual.pdf' then
    raise exception 'Handbook file was not readable';
  end if;
  perform public.shared_handbook('test-gateway','update',jsonb_build_object(
    'actor',a,'id',entry_id,'section','wifi','title','Guest Wi-Fi','value','ground-floor-guest','notes',''
  ));
  if (select title from public.house_handbook_entries where id=entry_id) <> 'Guest Wi-Fi' then
    raise exception 'Handbook entry was not updated';
  end if;
  result := public.shared_handbook('test-gateway','delete',jsonb_build_object('actor',a,'id',entry_id));
  if (result->'paths'->>0) not like (hid::text || '/%') then raise exception 'Delete did not return the private object path'; end if;
  if exists(select 1 from public.house_handbook_files where id=file_id) then raise exception 'Entry delete left file metadata'; end if;
end $$;
rollback;
