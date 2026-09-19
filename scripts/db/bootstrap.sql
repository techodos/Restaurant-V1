-- Local development bootstrap (equivalent to the roles Supabase already ships).
-- Supabase mapping: app_owner → postgres, app_runtime → a custom RLS-enforced
-- role (or `authenticated`), app_service → service_role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_owner') then
    create role app_owner login password 'app_owner' superuser;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime login password 'app_runtime' noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_service') then
    create role app_service login password 'app_service' bypassrls;
  end if;
end $$;
