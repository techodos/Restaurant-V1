-- =============================================================================
-- 0045 — Shared rate-limit counters
--
-- The in-process limiter (server/rate-limit.ts) keeps one bucket map per server
-- instance, so on Vercel / several containers an attacker's attempts spread over
-- instances and the effective limit multiplies. Sign-in, sign-up, OTP and password
-- reset limits now ALSO count here (checkSharedRateLimit), one row per hashed bucket
-- (no emails or IPs stored in clear). Server-only like email_verification_codes:
-- RLS on, no app_runtime policy, app_service only. If this migration is not applied
-- the shared check logs a warning and the in-process limits still apply.
-- =============================================================================

create table if not exists rate_limits (
  bucket   text primary key,
  hits     integer not null,
  reset_at timestamptz not null
);

create index if not exists rate_limits_reset_idx on rate_limits (reset_at);

alter table rate_limits enable row level security;
grant select, insert, update, delete on rate_limits to app_service;
