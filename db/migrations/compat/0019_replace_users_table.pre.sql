-- Runs right before 0019_replace_users_table.sql, in the same transaction, and ONLY when 0019 is still pending
-- (a database being built from scratch). Never edits 0019 itself: applied migrations are checksummed.
--
-- 0019 drops "customer_identities_user_id_fkey" on user_auth: the name that constraint had on the database 0019 was
-- written against (its user_auth table started life as customer_identities). A database built from the files in
-- this folder creates user_auth in 0018, so the constraint is "user_auth_user_id_fkey" and 0019 failed with
-- 'constraint "customer_identities_user_id_fkey" of relation "user_auth" does not exist'. Give it the old name.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'user_auth_user_id_fkey' and conrelid = 'public.user_auth'::regclass) then
    alter table user_auth rename constraint user_auth_user_id_fkey to customer_identities_user_id_fkey;
  end if;
end $$;
