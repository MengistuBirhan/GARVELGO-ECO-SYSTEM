/*
# Add credit_authorized flag to staff_users

Adds a boolean column `credit_authorized` to the existing `staff_users`
table. When true, the staff member is allowed to use the "Credit" payment
method in POS. By default only admin users are credit-authorized; all
other staff must be explicitly authorized by an admin.

## Changes
1. `staff_users` — new column:
   - `credit_authorized` (boolean, NOT NULL, default false)
2. Set `credit_authorized = true` for existing admin users.
3. Update `staff_login` and `staff_get_user` functions to return the
   `credit_authorized` column so the frontend can gate the Credit option.
*/

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS credit_authorized boolean NOT NULL DEFAULT false;

-- Existing admins get credit access by default
UPDATE staff_users SET credit_authorized = true WHERE role = 'admin';

-- Update staff_login to return credit_authorized
DROP FUNCTION IF EXISTS staff_login(text, text);
CREATE FUNCTION staff_login(p_username text, p_password text)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  role text,
  must_change_password boolean,
  credit_authorized boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.role, u.must_change_password, u.credit_authorized
  FROM staff_users u
  WHERE u.username = p_username
    AND u.active = true
    AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$;

-- Update staff_get_user to return credit_authorized
DROP FUNCTION IF EXISTS staff_get_user(uuid);
CREATE FUNCTION staff_get_user(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  role text,
  must_change_password boolean,
  credit_authorized boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.role, u.must_change_password, u.credit_authorized
  FROM staff_users u
  WHERE u.id = p_user_id AND u.active = true;
END;
$$;
