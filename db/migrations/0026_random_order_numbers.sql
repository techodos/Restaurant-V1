-- ---------------------------------------------------------------------------
-- Order numbers: random, unguessable codes (e.g. 7FKX-4XXMT) instead of the
-- sequential ORD-YYMM-XXXXX from 0006, so an order URL does not reveal how many
-- orders exist or make neighbouring order numbers easy to guess.
--
-- 4 + 5 characters from a 32-letter alphabet without 0/O/1/I = 32^9 (~35 trillion)
-- codes. 256 is divisible by 32, so `byte % 32` has no modulo bias. The loop
-- retries on the (astronomically rare) collision; `orders.order_number` is also
-- `unique` (0005).
--
-- Access control does not depend on the code being secret: RLS (0008) only lets
-- the browser that placed the order, the signed-in owner, or a signed `?t=` link
-- read it. Existing ORD-... numbers are left as they are.
--
-- Written as `public.assign_order_number` + drop/create trigger so it is safe to
-- run where this function was already applied by hand.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

create or replace function public.assign_order_number()
returns trigger
language plpgsql
as $$
declare
  chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text;
begin
  if new.order_number is null or btrim(new.order_number) = '' then
    loop
      code :=
        (select string_agg(substr(chars, (get_byte(gen_random_bytes(1), 0) % length(chars)) + 1, 1), '')
           from generate_series(1, 4))
        || '-' ||
        (select string_agg(substr(chars, (get_byte(gen_random_bytes(1), 0) % length(chars)) + 1, 1), '')
           from generate_series(1, 5));
      exit when not exists (select 1 from public.orders where order_number = code);
    end loop;
    new.order_number := code;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_order_number on public.orders;

create trigger assign_order_number
before insert on public.orders
for each row
execute function public.assign_order_number();

-- the sequential generator from 0006 is no longer attached to anything
drop function if exists app.assign_order_number();
