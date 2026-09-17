create or replace function public.validate_bill_shares()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $$
declare b public.entries; part record; total bigint:=0;
begin
 select * into b from public.entries where id=new.id;
 if not found or b.bill_shares is null then return null; end if;
 if b.kind<>'event' or b.category not in ('Rent','Bill') or b.amount is null or jsonb_typeof(b.bill_shares)<>'object'
 then raise exception 'Custom shares need a bill amount.'; end if;
 if (select count(*) from jsonb_object_keys(b.bill_shares))<>cardinality(b.payment_members) then raise exception 'Set a share for every bill participant.'; end if;
 for part in select * from jsonb_each(b.bill_shares) loop
  if not (part.key::uuid=any(b.payment_members)) or jsonb_typeof(part.value)<>'number' or part.value::text !~ '^[0-9]+$' then raise exception 'Shares must be whole, nonnegative cents for bill participants.'; end if;
  total:=total+(part.value::text)::bigint;
 end loop;
 if total<>round(b.amount*100)::bigint then raise exception 'Bill shares must add up to the total.'; end if;
 return null;
end
$$;

revoke all on function public.validate_bill_shares() from public, anon, authenticated;
