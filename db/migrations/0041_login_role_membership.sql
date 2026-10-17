-- The app logs in as ONE role (Supabase pooler: postgres.<ref>) and `set local role`s to app_runtime /
-- app_service per transaction (database.ts). That needs membership, which 0006 never granted: a fresh
-- project failed every query with 42501 "permission denied to set role app_runtime".
-- Idempotent; a no-op where the membership already exists or the grant is not permitted.
do $$
begin
  execute format('grant app_runtime, app_service to %I', current_user);
exception when others then
  raise notice 'could not grant app roles to %: %', current_user, sqlerrm;
end $$;
