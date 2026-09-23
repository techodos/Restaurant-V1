-- =============================================================================
-- 0020 — Fold user_auth into users (1:1, no longer needed as a side table)
--
-- user_auth (0018) existed only because the app's migrator role could never
-- get write access to auth.users, so the Google link had to live in a
-- separate app-owned table. 0019 replaced auth.users with an app-owned
-- `users` table, so that constraint is gone: user_auth is a 1:1
-- (user_id both primary key and the only foreign key) with nothing else
-- referencing it, so its two columns move onto `users` directly.
-- =============================================================================

alter table users add column google_sub text unique;
alter table users add column auth_provider text not null default 'password';

update users u set google_sub = ua.google_sub, auth_provider = ua.auth_provider
from user_auth ua
where ua.user_id = u.id;

drop table user_auth;
