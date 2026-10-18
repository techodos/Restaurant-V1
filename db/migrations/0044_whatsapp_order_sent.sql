-- WhatsApp checkout: the customer's own "Yes, I sent it" (wa.me reports nothing back, so this is self-reported).
-- null = not confirmed sent; an unconfirmed WhatsApp order older than the send window is cancelled as "Not sent on
-- WhatsApp" (services/whatsapp-checkout.ts#expireUnsentWhatsAppOrders). Additive; web orders never set it.
alter table orders
  add column if not exists whatsapp_sent_at timestamptz;

-- the expiry sweep: pending WhatsApp orders nobody confirmed, per restaurant
create index if not exists orders_whatsapp_unsent_idx
  on orders (restaurant_id, created_at)
  where source = 'whatsapp' and status = 'pending' and whatsapp_sent_at is null;
