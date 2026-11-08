-- =============================================================================
-- 0049 — `cashier` team role (in-store POS)
--
-- Its own file because a new enum value cannot be used in the transaction that
-- adds it; 0050 (permissions, POS tables) uses it. Additive: no existing row or
-- policy changes.
-- =============================================================================

alter type team_role add value if not exists 'cashier';
