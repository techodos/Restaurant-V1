-- Creates (or resets the password of) a staff login.
-- Run in Supabase Dashboard -> SQL Editor.
do $$
declare
  v_restaurant_id uuid;
  v_user_id uuid;
  v_email text := 'usmanazeem00@gmail.com';
  v_name text := 'Usman';
  v_role text := 'owner';
  v_slug text := 'bella-napoli';
  v_hash text := 'scrypt$16384$8$1$2c0510f4f6688bd4963a741886f62fc6$f900cfaf4658e78139b964672ee9267f42d8954e52616b37d08c9c5becb0d9594b180658d068296b885aae60e22ed67f41d201b5653a447c8259836269ba376d';
begin
  select id into v_restaurant_id from restaurants where slug = v_slug;
  if v_restaurant_id is null then
    raise exception 'No restaurant with slug %', v_slug;
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(v_email);

  if v_user_id is null then
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values (v_email, v_hash, jsonb_build_object('name', v_name))
    returning id into v_user_id;
  else
    update auth.users set encrypted_password = v_hash where id = v_user_id;
  end if;

  insert into team_members (restaurant_id, user_id, email, full_name, role, is_active, accepted_at)
  values (v_restaurant_id, v_user_id, v_email, v_name, v_role::team_role, true, now())
  on conflict (restaurant_id, email) do update set
    user_id = excluded.user_id, full_name = excluded.full_name, role = excluded.role, is_active = true;
end $$;
