/*
# Customer location + maps link, stricter payment policy

1. sales: customer_city, customer_kebele, customer_area, maps_link (normalized,
   validated Google Maps link or "lat,lng" pin). Mandatory in submit_sale.
2. gate_passes: customer_address, maps_link copied at approval time so the
   pass (and the email) carry the exact delivery address + navigation link.
3. Payment policy (enforced in submit_sale):
   - cash stays blocked; only telebirr / cbe_bank / credit
   - CBE Transaction ID must be present and match the CBE format (FT + 8-14
     letters/digits). Change the regex below if CBE's format differs for you.
   - Telebirr Transaction ID must be 8-20 letters/digits.
   - A transaction ID can be used only once (rejected sales free it again).
   - credit requires a credit-authorized admin to submit AND an admin approval;
     the approving admin is recorded in sales.credit_approved_by.
*/

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS customer_city text,
  ADD COLUMN IF NOT EXISTS customer_kebele text,
  ADD COLUMN IF NOT EXISTS customer_area text,
  ADD COLUMN IF NOT EXISTS maps_link text,
  ADD COLUMN IF NOT EXISTS credit_approved_by uuid;

ALTER TABLE gate_passes
  ADD COLUMN IF NOT EXISTS customer_address text,
  ADD COLUMN IF NOT EXISTS maps_link text;

-- One transaction ID = one live sale
CREATE UNIQUE INDEX IF NOT EXISTS sales_unique_txn_ref
  ON sales (payment_method, upper(transaction_ref))
  WHERE transaction_ref IS NOT NULL AND dispatch_status <> 'rejected'
    AND payment_method IN ('telebirr', 'cbe_bank');

-- Validate + normalize a Google Maps link / GPS pin.
-- Returns a clickable https URL, or NULL when invalid.
CREATE OR REPLACE FUNCTION normalize_maps_link(p text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE v text := trim(coalesce(p, ''));
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  -- "9.0320, 38.7469" style coordinates
  IF v ~ '^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$' THEN
    RETURN 'https://www.google.com/maps?q=' || regexp_replace(v, '\s+', '', 'g');
  END IF;
  IF v ~* '^https://(www\.)?google\.[a-z.]+/maps(/|\?|$)'
     OR v ~* '^https://maps\.google\.[a-z.]+(/|\?|$)'
     OR v ~* '^https://maps\.app\.goo\.gl/[A-Za-z0-9_-]+'
     OR v ~* '^https://goo\.gl/maps/[A-Za-z0-9_-]+' THEN
    RETURN v;
  END IF;
  RETURN NULL;
END;
$$;

DROP FUNCTION IF EXISTS submit_sale(uuid, text, text, uuid, numeric, text, numeric, numeric, text, numeric, text, text, uuid, text);

CREATE OR REPLACE FUNCTION submit_sale(
  p_staff_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_city text,
  p_customer_kebele text,
  p_customer_area text,
  p_maps_link text,
  p_material_id uuid,
  p_quantity numeric,
  p_unit text,
  p_unit_price numeric,
  p_transport_fee numeric,
  p_payment_method text,
  p_amount_paid numeric,
  p_transaction_ref text,
  p_paid_to_account text,
  p_vehicle_id uuid
) RETURNS sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mat materials; v_veh vehicles; v_sale sales;
  v_subtotal numeric; v_total numeric; v_paid numeric; v_status text;
  v_ref text := upper(trim(coalesce(p_transaction_ref, '')));
  v_maps text := normalize_maps_link(p_maps_link);
  v_addr text;
BEGIN
  IF p_payment_method NOT IN ('telebirr', 'cbe_bank', 'credit') THEN
    RAISE EXCEPTION 'This payment method is not allowed. (Cash is disabled.) / ጥሬ ገንዘብ አይፈቀድም።';
  END IF;

  IF p_payment_method = 'credit' AND NOT EXISTS (
    SELECT 1 FROM staff_users
    WHERE id = p_staff_id AND active = true AND (role = 'admin' OR credit_authorized = true)
  ) THEN
    RAISE EXCEPTION 'Credit requires admin permission.';
  END IF;

  -- Payment references
  IF p_payment_method = 'cbe_bank' THEN
    IF regexp_replace(coalesce(p_paid_to_account, ''), '\D', '', 'g') <> '1000474209637' THEN
      RAISE EXCEPTION 'ተሳስተዋል! ክፍያው የተፈጸመው ወደ ትክክለኛው የድርጅታችን የባንክ ሂሳብ ቁጥር (1000474209637) አይደለም። እባክዎን ትክክለኛውን ደረሰኝ/መረጃ ያስገቡ።';
    END IF;
    IF v_ref = '' THEN
      RAISE EXCEPTION 'CBE Transaction ID is required. / የCBE የግብይት መለያ ቁጥር ያስፈልጋል።';
    END IF;
    IF v_ref !~ '^FT[A-Z0-9]{8,14}$' THEN
      RAISE EXCEPTION 'Invalid CBE Transaction ID. It must look like FT24123ABCDE (starts with FT). / የተሳሳተ የCBE የግብይት መለያ ቁጥር። እባክዎን ከደረሰኙ ላይ በትክክል ያስገቡ።';
    END IF;
  ELSIF p_payment_method = 'telebirr' THEN
    IF v_ref !~ '^[A-Z0-9]{8,20}$' THEN
      RAISE EXCEPTION 'Invalid Telebirr Transaction ID. / የተሳሳተ የቴሌብር የግብይት መለያ ቁጥር።';
    END IF;
  END IF;

  IF p_payment_method IN ('telebirr', 'cbe_bank') AND EXISTS (
    SELECT 1 FROM sales
    WHERE payment_method = p_payment_method AND upper(transaction_ref) = v_ref
      AND dispatch_status <> 'rejected'
  ) THEN
    RAISE EXCEPTION 'This Transaction ID was already used for another sale. / ይህ የግብይት መለያ ቁጥር ከዚህ በፊት ጥቅም ላይ ውሏል።';
  END IF;

  -- Delivery location
  IF trim(coalesce(p_customer_city, '')) = '' THEN RAISE EXCEPTION 'Customer city is required.'; END IF;
  IF trim(coalesce(p_customer_kebele, '')) = '' THEN RAISE EXCEPTION 'Customer kebele is required.'; END IF;
  IF trim(coalesce(p_customer_area, '')) = '' THEN RAISE EXCEPTION 'Specific area / sefer is required.'; END IF;
  IF v_maps IS NULL THEN
    RAISE EXCEPTION 'A valid Google Maps link or GPS pin (lat,lng) is required so the driver can navigate. / ትክክለኛ የGoogle Maps ሊንክ ወይም GPS ያስገቡ።';
  END IF;

  IF coalesce(p_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Enter a valid quantity.'; END IF;
  IF trim(coalesce(p_customer_name, '')) = '' THEN RAISE EXCEPTION 'Customer name is required.'; END IF;

  SELECT * INTO v_mat FROM materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found.'; END IF;

  UPDATE vehicles SET status = 'pending_verification'
  WHERE id = p_vehicle_id AND status = 'available'
  RETURNING * INTO v_veh;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This truck is not available. Please choose another pre-registered truck.';
  END IF;

  v_addr := trim(p_customer_city) || ', Kebele ' || trim(p_customer_kebele) || ', ' || trim(p_customer_area);
  v_subtotal := p_quantity * coalesce(p_unit_price, 0);
  v_total := v_subtotal + coalesce(p_transport_fee, 0);
  v_paid := CASE WHEN p_payment_method = 'credit' THEN coalesce(p_amount_paid, 0) ELSE v_total END;
  v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;

  INSERT INTO sales (
    invoice_number, customer_name, customer_email, material_id, material_label,
    quantity, unit, unit_price, transport_fee, subtotal, total,
    payment_method, amount_paid, balance_due, status, transaction_ref, paid_to_account,
    vehicle_id, destination, customer_city, customer_kebele, customer_area, maps_link,
    dispatch_status
  ) VALUES (
    'INV-' || lpad(nextval('invoice_seq')::text, 6, '0'),
    trim(p_customer_name), nullif(trim(coalesce(p_customer_email, '')), ''),
    p_material_id,
    v_mat.name_am || CASE WHEN v_mat.subtype IS NOT NULL AND v_mat.subtype <> '' THEN ' · ' || v_mat.subtype ELSE '' END,
    p_quantity, p_unit, coalesce(p_unit_price, 0), coalesce(p_transport_fee, 0), v_subtotal, v_total,
    p_payment_method, v_paid, greatest(0, v_total - v_paid), v_status,
    CASE WHEN v_ref = '' THEN NULL ELSE v_ref END,
    CASE WHEN p_payment_method = 'cbe_bank' THEN regexp_replace(p_paid_to_account, '\D', '', 'g') ELSE NULL END,
    p_vehicle_id, v_addr, trim(p_customer_city), trim(p_customer_kebele), trim(p_customer_area), v_maps,
    'pending_verification'
  ) RETURNING * INTO v_sale;

  PERFORM deduct_stock(p_material_id, p_quantity);

  PERFORM notify(ARRAY['admin'], 'pending',
    CASE WHEN p_payment_method = 'credit' THEN 'CREDIT sale needs your approval' ELSE 'Payment awaiting verification' END,
    'ክፍያ ማረጋገጫ ይጠብቃል',
    v_sale.invoice_number || ' · ' || v_sale.customer_name || ' · truck ' || v_veh.plate_number ||
      ' — Pending Admin Verification', v_sale.id);
  PERFORM notify(ARRAY['cashier'], 'info', 'Submitted for verification', 'ለማረጋገጫ ተልኳል',
    v_sale.invoice_number || ' sent to admin. Truck ' || v_veh.plate_number || ' reserved.', v_sale.id);

  RETURN v_sale;
END;
$$;

CREATE OR REPLACE FUNCTION approve_sale(p_staff_id uuid, p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_sale sales; v_veh vehicles; v_pass gate_passes;
BEGIN
  IF NOT is_admin_user(p_staff_id) THEN RAISE EXCEPTION 'Admin access required.'; END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found.'; END IF;
  IF v_sale.dispatch_status <> 'pending_verification' THEN
    RAISE EXCEPTION 'This sale is not pending verification (current: %).', v_sale.dispatch_status;
  END IF;
  IF v_sale.maps_link IS NULL THEN
    RAISE EXCEPTION 'This sale has no Google Maps link, so it cannot be approved. Reject it and ask the cashier to resubmit.';
  END IF;
  SELECT * INTO v_veh FROM vehicles WHERE id = v_sale.vehicle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The truck for this sale no longer exists.'; END IF;

  UPDATE sales SET dispatch_status = 'approved', approved_at = now(), approved_by = p_staff_id,
                   credit_approved_by = CASE WHEN payment_method = 'credit' THEN p_staff_id ELSE NULL END,
                   rejection_reason = NULL
  WHERE id = p_sale_id RETURNING * INTO v_sale;
  UPDATE vehicles SET status = 'approved' WHERE id = v_veh.id;

  INSERT INTO gate_passes (pass_number, sale_id, vehicle_id, truck_plate, driver_name, driver_phone,
                           vehicle_model, destination, customer_address, maps_link,
                           material_label, quantity, unit, order_ref)
  VALUES ('GP-' || lpad(nextval('gate_pass_seq')::text, 6, '0'), v_sale.id, v_veh.id,
          v_veh.plate_number, v_veh.driver_name, v_veh.driver_phone, v_veh.vehicle_model,
          coalesce(v_sale.destination, '—'), coalesce(v_sale.destination, '—'), v_sale.maps_link,
          v_sale.material_label, v_sale.quantity, v_sale.unit, v_sale.invoice_number)
  RETURNING * INTO v_pass;

  PERFORM notify(ARRAY['cashier'], 'approved', 'Payment approved', 'ክፍያ ጸድቋል',
    v_sale.invoice_number || ' approved. Gate pass ' || v_pass.pass_number || ' issued.', v_sale.id);
  PERFORM notify(ARRAY['gatekeeper'], 'approved', 'Truck ready for exit', 'መኪና ለመውጣት ዝግጁ ነው',
    'Truck ' || v_veh.plate_number || ' (' || v_veh.driver_name || ') → ' || coalesce(v_sale.destination, '') ||
      ' · ' || v_pass.pass_number, v_sale.id);

  RETURN jsonb_build_object('sale', to_jsonb(v_sale), 'gate_pass', to_jsonb(v_pass));
END;
$$;

GRANT EXECUTE ON FUNCTION
  submit_sale(uuid, text, text, text, text, text, text, uuid, numeric, text, numeric, numeric, text, numeric, text, text, uuid),
  approve_sale(uuid, uuid)
TO anon, authenticated;
