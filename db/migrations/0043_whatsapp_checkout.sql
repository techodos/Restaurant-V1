-- WhatsApp checkout (phase 1): a restaurant can hand orders to its WhatsApp instead of the full online checkout.
--   restaurants.checkout_mode  platform-set (super admin): 'standard' (default, every existing restaurant) | 'whatsapp'
--   restaurant1s.whatsapp      optional per-branch WhatsApp number; null = the restaurant's restaurants.whatsapp
--   orders.source              'web' (default, every existing order) | 'whatsapp' (handed to WhatsApp to send)
-- Additive only: defaults keep every existing row and query behaving exactly as before.

alter table restaurants
  add column if not exists checkout_mode text not null default 'standard';
alter table restaurants
  drop constraint if exists restaurants_checkout_mode_check;
alter table restaurants
  add constraint restaurants_checkout_mode_check check (checkout_mode in ('standard', 'whatsapp'));

alter table restaurant1s
  add column if not exists whatsapp text;

alter table orders
  add column if not exists source text not null default 'web';
alter table orders
  drop constraint if exists orders_source_check;
alter table orders
  add constraint orders_source_check check (source in ('web', 'whatsapp'));
