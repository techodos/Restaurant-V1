-- =============================================================================
-- 0025 — Coupons can be restricted to specific customers (by email or phone)
-- Admin pastes a list of emails/phone numbers when creating or editing a coupon (admin/coupons).
-- When either array is non-empty, the coupon only validates for a matching email or phone
-- (server/domain/pricing.ts#validateCouponOrThrow, the one place coupon validity is decided) —
-- everyone else sees the same generic "not valid" message a wrong code gets, so a private coupon's
-- existence is never leaked. Empty arrays (the default) mean "open to everyone", unchanged from
-- before this migration.
-- =============================================================================

alter table coupons add column eligible_emails text[] not null default '{}';
alter table coupons add column eligible_phones text[] not null default '{}';
