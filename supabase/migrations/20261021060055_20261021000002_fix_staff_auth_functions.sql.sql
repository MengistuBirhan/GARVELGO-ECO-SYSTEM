/*
# Fix staff auth functions to schema-qualify pgcrypto calls

The pgcrypto extension installs `crypt()` and `gen_salt()` into the
`extensions` schema on this Supabase project, not `public`. The
SECURITY DEFINER functions set `search_path = public`, so unqualified
`crypt()` / `gen_salt()` calls fail with "function does not exist".

This migration re-creates all three functions with explicit
`extensions.crypt` / `extensions.gen_salt` references so they resolve
regardless of search_path. No data changes; existing password hashes
remain valid.
*/

CREATE OR REPLACE FUNCTION staff_login(p_username text, p_password text)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  role text,
  must_change_password boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.role, u.must_change_password
  FROM staff_users u
  WHERE u.username = p_username
    AND u.active = true
    AND u.password_hash = extensions.crypt(p_password, u.password_hash);
END;
$$;

CREATE OR REPLACE FUNCTION staff_change_password(p_user_id uuid, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE staff_users
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      must_change_password = false
  WHERE id = p_user_id AND active = true;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION staff_get_user(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  role text,
  must_change_password boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.role, u.must_change_password
  FROM staff_users u
  WHERE u.id = p_user_id AND u.active = true;
END;
$$;
