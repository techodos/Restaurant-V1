-- 0031 — platform-wide role for the developers who run the product (see SKILL.md "Super admin").
-- Alone in its own file: Postgres will not let a new enum value be used in the transaction that adds it.
alter type team_role add value if not exists 'super_admin';
