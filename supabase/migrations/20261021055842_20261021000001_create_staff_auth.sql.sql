/*
# Staff authentication system for admin access control

Adds a dedicated staff-users table with server-side password hashing
(pgcrypto's `crypt()` with a bcrypt-style blowfish salt) and a set of
SECURITY DEFINER functions that mediate all access. The password_hash
column is never readable by the anon/authenticated roles — login and
password changes go through functions only.

## Tables

1. `staff_users`
   - id (uuid pk)
   - username (text, unique — e.g. "admin")
   - display_name (text, human-friendly name shown in the UI)
   - password_hash (text, output of crypt(password, gen_salt('bf')))
   - role (text: admin | cashier | gatekeeper)
   - must_change_password (boolean, true on first login / seeded admin)
   - active (boolean, soft-disable toggle)
   - created_at (timestamptz)

## Functions (SECURITY DEFINER, search_path locked to public)

1. `staff_login(p_username, p_password)` → returns
   (id, username, display_name, role, must_change_password) or no rows.
   Verifies the password against the stored hash without exposing it.

2. `staff_change_password(p_user_id, p_new_password)` → boolean.
   Hashes the new password, clears must_change_password, returns success.

3. `staff_get_user(p_user_id)` → same columns as login, for session
   re-validation on page reload.

## Seed

A default admin account is inserted if no staff_users exist:
  username: admin
  password: ChangeMe123!
  role: admin
  must_change_password: true

## Security

- RLS enabled on staff_users; NO policies are created, so the anon and
  authenticated roles can never read or write the table directly.
- All reads/writes go through SECURITY DEFINER functions that run as the
  table owner.
- Passwords are hashed with `crypt(password, gen_salt('bf'))` — a
  bcrypt-equivalent one-way hash. Plaintext is never stored.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'cashier', 'gatekeeper')),
  must_change_password boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;

-- Seed default admin if not present
INSERT INTO staff_users (username, display_name, password_hash, role, must_change_password)
SELECT 'admin', 'System Administrator', crypt('ChangeMe123!', gen_salt('bf')), 'admin', true
WHERE NOT EXISTS (SELECT 1 FROM staff_users WHERE username = 'admin');

-- staff_login: verify credentials, return safe user info (no password_hash)
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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.role, u.must_change_password
  FROM staff_users u
  WHERE u.username = p_username
    AND u.active = true
    AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$;

-- staff_change_password: set new hash, clear must_change_password
CREATE OR REPLACE FUNCTION staff_change_password(p_user_id uuid, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE staff_users
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      must_change_password = false
  WHERE id = p_user_id AND active = true;
  RETURN FOUND;
END;
$$;

-- staff_get_user: re-validate a stored session by user id
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
