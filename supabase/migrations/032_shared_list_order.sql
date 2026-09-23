begin;
create table public.house_list_order (
  household_id uuid not null references public.households(id) on delete cascade,
  list text not null check (list in ('tasks','shopping')),
  ids jsonb not null default '[]'::jsonb check (jsonb_typeof(ids)='array' and jsonb_array_length(ids)<=1000),
  updated_at timestamptz not null default now(),
  primary key (household_id,list)
);
alter table public.house_list_order enable row level security;
revoke all on public.house_list_order from public,anon,authenticated;
create function public.shared_list_order(access_token text, operation text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare hid uuid; actor uuid; wanted text; clean jsonb;
begin
  select household_id into hid from public.shared_home_config where gateway_hash=encode(extensions.digest(access_token,'sha256'),'hex');
  if hid is null then raise exception 'Access denied' using errcode='42501'; end if;
  wanted:=payload->>'list';
  if wanted not in ('tasks','shopping') then raise exception 'Invalid list'; end if;
  if operation='get' then
    return jsonb_build_object('ids',coalesce((select ids from public.house_list_order where household_id=hid and list=wanted),'[]'::jsonb));
  end if;
  if operation<>'save' then raise exception 'Invalid operation'; end if;
  actor:=nullif(payload->>'actor','')::uuid;
  if not exists(select 1 from public.members where household_id=hid and user_id=actor and active and name<>'Housemates') then raise exception 'Sign in as a housemate'; end if;
  if jsonb_typeof(payload->'ids')<>'array' or jsonb_array_length(payload->'ids')>1000 then raise exception 'Invalid list order'; end if;
  select coalesce(jsonb_agg(e.id order by x.ordinality),'[]'::jsonb) into clean
  from jsonb_array_elements_text(payload->'ids') with ordinality x(id,ordinality)
  join public.entries e on e.id::text=x.id and e.household_id=hid
    and e.kind=case wanted when 'tasks' then 'task' else 'request' end
    and coalesce(e.visibility,'household')='household';
  insert into public.house_list_order(household_id,list,ids) values(hid,wanted,clean)
  on conflict(household_id,list) do update set ids=excluded.ids,updated_at=now();
  return jsonb_build_object('ids',clean);
end $$;
revoke all on function public.shared_list_order(text,text,jsonb) from public,authenticated;
grant execute on function public.shared_list_order(text,text,jsonb) to anon;
commit;
