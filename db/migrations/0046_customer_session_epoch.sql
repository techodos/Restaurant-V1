-- =============================================================================
-- 0046 — Customer session epoch
--
-- Customer sessions are 30-day signed cookies with no server-side list, so a password reset could not end
-- a stolen session. `session_epoch` is copied into every session token (`epoch` claim); a password reset
-- increments it, and anything that acts on the account (place order, profile, My Orders) refuses a token
-- whose epoch is behind. Tokens signed before this migration carry no claim and count as epoch 0.
-- =============================================================================

alter table customers add column if not exists session_epoch integer not null default 0;
