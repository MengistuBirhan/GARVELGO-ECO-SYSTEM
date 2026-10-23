/*
# Garvelgo Material Supply — truck workflow, payment hardening, admin recovery

## 1. Payment rules
- `cash` is no longer a valid payment method (CHECK constraints, NOT VALID so
  historic rows are left untouched).
- CBE transfers must be paid to account 1000474209637. Enforced in the
  `submit_sale` RPC AND in a trigger on `sales`, so it cannot be bypassed.
- `credit` can only be submitted by an active staff user with
  `credit_authorized = true` (admins by default).

## 2. Vehicles (pre-registered trucks)
`vehicles` table: plate_number (unique), driver_name, driver_phone,
vehicle_model, status:
  available -> pending_verification -> approved -> exited -> available
Only admins can create / edit / delete (via RPC); everyone can read.

## 3. Sale / dispatch workflow (`sales.dispatch_status`)
  pending_verification -> approved -> exited -> completed
                       \-> rejected (truck released, stock restored)
All transitions happen in SECURITY DEFINER RPCs (atomic, row-locked):
  submit_sale, approve_sale, reject_sale, confirm_exit, confirm_return

## 4. Notifications
`notifications` table (audience = admin | cashier | gatekeeper) written by the
RPCs, published on supabase_realtime for instant in-app alerts.

## 5. Admin access
- Fixes pgcrypto schema qualification (the previous migration re-created
  staff_login / staff_get_user with unqualified crypt()).
- Guarantees a default admin exists (admin / ChangeMe123!).
- Adds a recovery key + `staff_reset_admin_password` for password reset.
  Default recovery key: GARVELGO-RESET-2026  (CHANGE IT after first login).
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 5. Admin access
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS staff_login(text, text);
CREATE FUNCTION staff_login(p_username text, p_password text)
RETURNS TABLE(id uuid, username text, display_name text, role text,
              must_change_password boolean, credit_authorized boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.role, u.must_change_password, u.credit_authorized
  FROM staff_users u
  WHERE u.username = p_username
    AND u.active = true
    AND u.password_hash = extensions.crypt(p_password, u.password_hash);
END;
$$;

DROP FUNCTION IF EXISTS staff_get_user(uuid);
CREATE FUNCTION staff_get_user(p_user_id uuid)
RETURNS TABLE(id uuid, username text, display_name text, role text,
              must_change_password boolean, credit_authorized boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.role, u.must_change_password, u.credit_authorized
  FROM staff_users u
  WHERE u.id = p_user_id AND u.active = true;
END;
$$;

CREATE OR REPLACE FUNCTION staff_change_password(p_user_id uuid, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF length(coalesce(p_new_password, '')) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.';
  END IF;
  UPDATE staff_users
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      must_change_password = false
  WHERE id = p_user_id AND active = true;
  RETURN FOUND;
END;
$$;

-- Guarantee a usable default admin exists.
UPDATE staff_users
SET active = true, role = 'admin', credit_authorized = true
WHERE username = 'admin'
  AND NOT EXISTS (SELECT 1 FROM staff_users WHERE role = 'admin' AND active = true);

INSERT INTO staff_users (username, display_name, password_hash, role, must_change_password, credit_authorized)
SELECT 'admin', 'System Administrator', extensions.crypt('ChangeMe123!', extensions.gen_salt('bf')),
       'admin', true, true
WHERE NOT EXISTS (SELECT 1 FROM staff_users WHERE username = 'admin');

-- Recovery key store (no RLS policies => unreadable by anon/authenticated).
CREATE TABLE IF NOT EXISTS app_secrets (
  key text PRIMARY KEY,
  value_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO app_secrets (key, value_hash)
VALUES ('admin_recovery', extensions.crypt('GARVELGO-RESET-2026', extensions.gen_salt('bf')))
ON CONFLICT (key) DO NOTHING;

-- Reset the admin password using the recovery key.
CREATE OR REPLACE FUNCTION staff_reset_admin_password(p_recovery_key text, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_hash text;
BEGIN
  IF length(coalesce(p_new_password, '')) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.';
  END IF;
  SELECT value_hash INTO v_hash FROM app_secrets WHERE key = 'admin_recovery';
  IF v_hash IS NULL OR v_hash <> extensions.crypt(coalesce(p_recovery_key, ''), v_hash) THEN
    RETURN false;
  END IF;
  UPDATE staff_users
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      must_change_password = false,
      active = true
  WHERE username = 'admin';
  RETURN FOUND;
END;
$$;

-- Admin changes the recovery key.
CREATE OR REPLACE FUNCTION staff_set_recovery_key(p_user_id uuid, p_new_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff_users WHERE id = p_user_id AND role = 'admin' AND active) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  IF length(coalesce(p_new_key, '')) < 10 THEN
    RAISE EXCEPTION 'Recovery key must be at least 10 characters.';
  END IF;
  INSERT INTO app_secrets (key, value_hash)
  VALUES ('admin_recovery', extensions.crypt(p_new_key, extensions.gen_salt('bf')))
  ON CONFLICT (key) DO UPDATE SET value_hash = EXCLUDED.value_hash, updated_at = now();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION is_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_users WHERE id = p_user_id AND role = 'admin' AND active = true);
$$;

-- ---------------------------------------------------------------------------
-- 1. Payment rules: no cash
-- ---------------------------------------------------------------------------
ALTER TABLE sales ALTER COLUMN payment_method SET DEFAULT 'telebirr';
ALTER TABLE payments ALTER COLUMN method SET DEFAULT 'telebirr';

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_no_cash;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_no_cash
  CHECK (payment_method IN ('telebirr', 'cbe_bank', 'credit')) NOT VALID;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_no_cash;
ALTER TABLE payments ADD CONSTRAINT payments_method_no_cash
  CHECK (method IN ('telebirr', 'cbe_bank')) NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Vehicles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number text NOT NULL,
  driver_name text NOT NULL,
  driver_phone text NOT NULL,
  vehicle_model text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'pending_verification', 'approved', 'exited')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_unique ON vehicles (upper(plate_number));

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_vehicles" ON vehicles;
CREATE POLICY "anon_read_vehicles" ON vehicles FOR SELECT TO anon, authenticated USING (true);
-- No insert/update/delete policies: writes only via admin RPCs below.

-- ---------------------------------------------------------------------------
-- 3. Sales / gate pass columns
-- ---------------------------------------------------------------------------
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatch_status text,
  ADD COLUMN IF NOT EXISTS paid_to_account text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS exited_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text;

-- Historic sales are already finished business.
UPDATE sales SET dispatch_status = 'completed' WHERE dispatch_status IS NULL;
ALTER TABLE sales ALTER COLUMN dispatch_status SET DEFAULT 'pending_verification';
ALTER TABLE sales ALTER COLUMN dispatch_status SET NOT NULL;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_dispatch_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_dispatch_status_check
  CHECK (dispatch_status IN ('pending_verification', 'approved', 'rejected', 'exited', 'completed'));
CREATE INDEX IF NOT EXISTS sales_dispatch_status_idx ON sales (dispatch_status);

ALTER TABLE gate_passes
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_phone text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS exited_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz;

-- Sales and gate passes are now created only by RPCs.
DROP POLICY IF EXISTS "anon_ins_sales" ON sales;
DROP POLICY IF EXISTS "anon_ins_gate_passes" ON gate_passes;

-- Running numbers (collision-free replacement for count()+1)
CREATE SEQUENCE IF NOT EXISTS invoice_seq;
CREATE SEQUENCE IF NOT EXISTS gate_pass_seq;
SELECT setval('invoice_seq',
  coalesce((SELECT max(substring(invoice_number from '\d+$')::bigint) FROM sales), 0) + 1, false);
SELECT setval('gate_pass_seq',
  coalesce((SELECT max(substring(pass_number from '\d+$')::bigint) FROM gate_passes), 0) + 1, false);

-- CBE account guard (defence in depth, fires on insert or when changed)
CREATE OR REPLACE FUNCTION enforce_cbe_account() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payment_method = 'cbe_bank'
     AND (TG_OP = 'INSERT'
          OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
          OR NEW.paid_to_account IS DISTINCT FROM OLD.paid_to_account)
     AND regexp_replace(coalesce(NEW.paid_to_account, ''), '\D', '', 'g') <> '1000474209637' THEN
    RAISE EXCEPTION 'ተሳስተዋል! ክፍያው የተፈጸመው ወደ ትክክለኛው የድርጅታችን የባንክ ሂሳብ ቁጥር (1000474209637) አይደለም። እባክዎን ትክክለኛውን ደረሰኝ/መረጃ ያስገቡ።';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sales_enforce_cbe_account ON sales;
CREATE TRIGGER sales_enforce_cbe_account
  BEFORE INSERT OR UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION enforce_cbe_account();

-- ---------------------------------------------------------------------------
-- 4. Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK (audience IN ('admin', 'cashier', 'gatekeeper')),
  kind text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  title_am text,
  message text NOT NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_audience_idx ON notifications (audience, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_notifications" ON notifications;
CREATE POLICY "anon_read_notifications" ON notifications FOR SELECT TO anon, authenticated USING (true);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notifications', 'sales', 'vehicles'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'supabase_realtime publication not found; enable Realtime for notifications, sales, vehicles manually.';
END $$;

CREATE OR REPLACE FUNCTION notify(p_audience text[], p_kind text, p_title text, p_title_am text,
                                  p_message text, p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE a text;
BEGIN
  FOREACH a IN ARRAY p_audience LOOP
    INSERT INTO notifications (audience, kind, title, title_am, message, sale_id)
    VALUES (a, p_kind, p_title, p_title_am, p_message, p_sale_id);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Stock helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deduct_stock(p_material_id uuid, p_qty numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE materials SET stock_quantity = greatest(0, stock_quantity - p_qty) WHERE id = p_material_id; $$;

CREATE OR REPLACE FUNCTION restore_stock(p_material_id uuid, p_qty numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE materials SET stock_quantity = stock_quantity + p_qty WHERE id = p_material_id; $$;

-- ---------------------------------------------------------------------------
-- Vehicle admin RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vehicle_save(p_staff_id uuid, p_id uuid, p_plate text, p_driver text,
                                        p_phone text, p_model text)
RETURNS vehicles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v vehicles; plate text := upper(trim(coalesce(p_plate, '')));
BEGIN
  IF NOT is_admin_user(p_staff_id) THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF plate = '' THEN RAISE EXCEPTION 'Plate number is required.'; END IF;
  IF trim(coalesce(p_driver, '')) = '' THEN RAISE EXCEPTION 'Driver name is required.'; END IF;
  IF trim(coalesce(p_phone, '')) = '' THEN RAISE EXCEPTION 'Driver phone is required.'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO vehicles (plate_number, driver_name, driver_phone, vehicle_model, status)
    VALUES (plate, trim(p_driver), trim(p_phone), trim(coalesce(p_model, '')), 'available')
    RETURNING * INTO v;
  ELSE
    UPDATE vehicles
    SET plate_number = plate, driver_name = trim(p_driver),
        driver_phone = trim(p_phone), vehicle_model = trim(coalesce(p_model, ''))
    WHERE id = p_id
    RETURNING * INTO v;
    IF NOT FOUND THEN RAISE EXCEPTION 'Truck not found.'; END IF;
  END IF;
  RETURN v;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A truck with plate % is already registered.', plate;
END;
$$;

CREATE OR REPLACE FUNCTION vehicle_delete(p_staff_id uuid, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_user(p_staff_id) THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  DELETE FROM vehicles WHERE id = p_id AND status = 'available';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only trucks with status Available can be deleted.';
  END IF;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Workflow RPCs
-- ---------------------------------------------------------------------------

-- Cashier submits a sale with a pre-registered, Available truck.
CREATE OR REPLACE FUNCTION submit_sale(
  p_staff_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_material_id uuid,
  p_quantity numeric,
  p_unit text,
  p_unit_price numeric,
  p_transport_fee numeric,
  p_payment_method text,
  p_amount_paid numeric,
  p_transaction_ref text,
  p_paid_to_account text,
  p_vehicle_id uuid,
  p_destination text
) RETURNS sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mat materials;
  v_veh vehicles;
  v_sale sales;
  v_subtotal numeric;
  v_total numeric;
  v_paid numeric;
  v_status text;
BEGIN
  IF p_payment_method NOT IN ('telebirr', 'cbe_bank', 'credit') THEN
    RAISE EXCEPTION 'This payment method is not allowed.';
  END IF;

  IF p_payment_method = 'credit' AND NOT EXISTS (
    SELECT 1 FROM staff_users
    WHERE id = p_staff_id AND active = true AND (role = 'admin' OR credit_authorized = true)
  ) THEN
    RAISE EXCEPTION 'Credit requires admin permission.';
  END IF;

  IF p_payment_method IN ('telebirr', 'cbe_bank') AND trim(coalesce(p_transaction_ref, '')) = '' THEN
    RAISE EXCEPTION 'A transaction reference number is required.';
  END IF;

  IF p_payment_method = 'cbe_bank'
     AND regexp_replace(coalesce(p_paid_to_account, ''), '\D', '', 'g') <> '1000474209637' THEN
    RAISE EXCEPTION 'ተሳስተዋል! ክፍያው የተፈጸመው ወደ ትክክለኛው የድርጅታችን የባንክ ሂሳብ ቁጥር (1000474209637) አይደለም። እባክዎን ትክክለኛውን ደረሰኝ/መረጃ ያስገቡ።';
  END IF;

  IF coalesce(p_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Enter a valid quantity.'; END IF;
  IF trim(coalesce(p_customer_name, '')) = '' THEN RAISE EXCEPTION 'Customer name is required.'; END IF;
  IF trim(coalesce(p_destination, '')) = '' THEN RAISE EXCEPTION 'Destination is required.'; END IF;

  SELECT * INTO v_mat FROM materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found.'; END IF;

  -- Lock the truck: only an Available one can be taken.
  UPDATE vehicles SET status = 'pending_verification'
  WHERE id = p_vehicle_id AND status = 'available'
  RETURNING * INTO v_veh;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This truck is not available. Please choose another pre-registered truck.';
  END IF;

  v_subtotal := p_quantity * coalesce(p_unit_price, 0);
  v_total := v_subtotal + coalesce(p_transport_fee, 0);
  v_paid := CASE WHEN p_payment_method = 'credit' THEN coalesce(p_amount_paid, 0) ELSE v_total END;
  v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;

  INSERT INTO sales (
    invoice_number, customer_name, customer_email, material_id, material_label,
    quantity, unit, unit_price, transport_fee, subtotal, total,
    payment_method, amount_paid, balance_due, status, transaction_ref, paid_to_account,
    vehicle_id, destination, dispatch_status
  ) VALUES (
    'INV-' || lpad(nextval('invoice_seq')::text, 6, '0'),
    trim(p_customer_name), nullif(trim(coalesce(p_customer_email, '')), ''),
    p_material_id,
    v_mat.name_am || CASE WHEN v_mat.subtype IS NOT NULL AND v_mat.subtype <> '' THEN ' · ' || v_mat.subtype ELSE '' END,
    p_quantity, p_unit, coalesce(p_unit_price, 0), coalesce(p_transport_fee, 0), v_subtotal, v_total,
    p_payment_method, v_paid, greatest(0, v_total - v_paid), v_status,
    nullif(trim(coalesce(p_transaction_ref, '')), ''),
    CASE WHEN p_payment_method = 'cbe_bank' THEN regexp_replace(p_paid_to_account, '\D', '', 'g') ELSE NULL END,
    p_vehicle_id, trim(p_destination), 'pending_verification'
  ) RETURNING * INTO v_sale;

  PERFORM deduct_stock(p_material_id, p_quantity);

  PERFORM notify(ARRAY['admin'], 'pending',
    'Payment awaiting verification', 'ክፍያ ማረጋገጫ ይጠብቃል',
    v_sale.invoice_number || ' · ' || v_sale.customer_name || ' · truck ' || v_veh.plate_number ||
      ' — Pending Admin Verification', v_sale.id);
  PERFORM notify(ARRAY['cashier'], 'info',
    'Submitted for verification', 'ለማረጋገጫ ተልኳል',
    v_sale.invoice_number || ' sent to admin. Truck ' || v_veh.plate_number || ' reserved.', v_sale.id);

  RETURN v_sale;
END;
$$;

-- Admin approves: truck -> approved, gate pass created.
CREATE OR REPLACE FUNCTION approve_sale(p_staff_id uuid, p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale sales; v_veh vehicles; v_pass gate_passes;
BEGIN
  IF NOT is_admin_user(p_staff_id) THEN RAISE EXCEPTION 'Admin access required.'; END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;
  IF v_sale.dispatch_status <> 'pending_verification' THEN
    RAISE EXCEPTION 'This sale is not pending verification (current: %).', v_sale.dispatch_status;
  END IF;
  SELECT * INTO v_veh FROM vehicles WHERE id = v_sale.vehicle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The truck for this sale no longer exists.'; END IF;

  UPDATE sales SET dispatch_status = 'approved', approved_at = now(), approved_by = p_staff_id,
                   rejection_reason = NULL
  WHERE id = p_sale_id RETURNING * INTO v_sale;
  UPDATE vehicles SET status = 'approved' WHERE id = v_veh.id;

  INSERT INTO gate_passes (pass_number, sale_id, vehicle_id, truck_plate, driver_name, driver_phone,
                           vehicle_model, destination, material_label, quantity, unit, order_ref)
  VALUES ('GP-' || lpad(nextval('gate_pass_seq')::text, 6, '0'), v_sale.id, v_veh.id,
          v_veh.plate_number, v_veh.driver_name, v_veh.driver_phone, v_veh.vehicle_model,
          coalesce(v_sale.destination, '—'), v_sale.material_label, v_sale.quantity, v_sale.unit,
          v_sale.invoice_number)
  RETURNING * INTO v_pass;

  PERFORM notify(ARRAY['cashier'], 'approved', 'Payment approved', 'ክፍያ ጸድቋል',
    v_sale.invoice_number || ' approved. Gate pass ' || v_pass.pass_number || ' issued.', v_sale.id);
  PERFORM notify(ARRAY['gatekeeper'], 'approved', 'Truck ready for exit', 'መኪና ለመውጣት ዝግጁ ነው',
    'Truck ' || v_veh.plate_number || ' (' || v_veh.driver_name || ') · ' || v_pass.pass_number, v_sale.id);

  RETURN jsonb_build_object('sale', to_jsonb(v_sale), 'gate_pass', to_jsonb(v_pass));
END;
$$;

-- Admin rejects: truck released, stock restored.
CREATE OR REPLACE FUNCTION reject_sale(p_staff_id uuid, p_sale_id uuid, p_reason text)
RETURNS sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_sale sales; v_plate text;
BEGIN
  IF NOT is_admin_user(p_staff_id) THEN RAISE EXCEPTION 'Admin access required.'; END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;
  IF v_sale.dispatch_status <> 'pending_verification' THEN
    RAISE EXCEPTION 'This sale is not pending verification (current: %).', v_sale.dispatch_status;
  END IF;

  UPDATE sales SET dispatch_status = 'rejected',
                   rejection_reason = nullif(trim(coalesce(p_reason, '')), '')
  WHERE id = p_sale_id RETURNING * INTO v_sale;

  UPDATE vehicles SET status = 'available' WHERE id = v_sale.vehicle_id
  RETURNING plate_number INTO v_plate;
  IF v_sale.material_id IS NOT NULL THEN
    PERFORM restore_stock(v_sale.material_id, v_sale.quantity);
  END IF;

  PERFORM notify(ARRAY['cashier'], 'rejected', 'Payment rejected', 'ክፍያ ተቀባይነት አላገኘም',
    v_sale.invoice_number || ' was rejected' ||
      CASE WHEN v_sale.rejection_reason IS NOT NULL THEN ': ' || v_sale.rejection_reason ELSE '.' END ||
      ' Truck ' || coalesce(v_plate, '') || ' is available again.', v_sale.id);
  PERFORM notify(ARRAY['admin'], 'rejected', 'Sale rejected', 'ሽያጭ ውድቅ ሆኗል',
    v_sale.invoice_number || ' rejected.', v_sale.id);

  RETURN v_sale;
END;
$$;

-- Security: truck leaves.
CREATE OR REPLACE FUNCTION confirm_exit(p_sale_id uuid)
RETURNS sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_sale sales; v_plate text;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;
  IF v_sale.dispatch_status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved trucks can exit (current: %).', v_sale.dispatch_status;
  END IF;

  UPDATE sales SET dispatch_status = 'exited', exited_at = now()
  WHERE id = p_sale_id RETURNING * INTO v_sale;
  UPDATE vehicles SET status = 'exited' WHERE id = v_sale.vehicle_id RETURNING plate_number INTO v_plate;
  UPDATE gate_passes SET exited_at = now() WHERE sale_id = p_sale_id;

  PERFORM notify(ARRAY['admin', 'cashier'], 'exited', 'Truck exited', 'ወጥቷል',
    'Truck ' || coalesce(v_plate, '') || ' exited with ' || v_sale.invoice_number || '.', v_sale.id);
  RETURN v_sale;
END;
$$;

-- Security: truck is back -> Available again.
CREATE OR REPLACE FUNCTION confirm_return(p_sale_id uuid)
RETURNS sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_sale sales; v_plate text;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;
  IF v_sale.dispatch_status <> 'exited' THEN
    RAISE EXCEPTION 'Only exited trucks can be marked returned (current: %).', v_sale.dispatch_status;
  END IF;

  UPDATE sales SET dispatch_status = 'completed', returned_at = now()
  WHERE id = p_sale_id RETURNING * INTO v_sale;
  UPDATE vehicles SET status = 'available' WHERE id = v_sale.vehicle_id RETURNING plate_number INTO v_plate;
  UPDATE gate_passes SET returned_at = now() WHERE sale_id = p_sale_id;

  PERFORM notify(ARRAY['admin', 'cashier', 'gatekeeper'], 'returned', 'Truck returned', 'ተመልሷል',
    'Truck ' || coalesce(v_plate, '') || ' is back and Available (ዝግጁ ነው).', v_sale.id);
  RETURN v_sale;
END;
$$;

GRANT EXECUTE ON FUNCTION
  staff_login(text, text), staff_get_user(uuid), staff_change_password(uuid, text),
  staff_reset_admin_password(text, text), staff_set_recovery_key(uuid, text),
  vehicle_save(uuid, uuid, text, text, text, text), vehicle_delete(uuid, uuid),
  submit_sale(uuid, text, text, uuid, numeric, text, numeric, numeric, text, numeric, text, text, uuid, text),
  approve_sale(uuid, uuid), reject_sale(uuid, uuid, text),
  confirm_exit(uuid), confirm_return(uuid)
TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION notify(text[], text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION deduct_stock(uuid, numeric), restore_stock(uuid, numeric) FROM PUBLIC, anon, authenticated;
