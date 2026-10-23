/*
# Test mode for submit_sale

Adds a p_test_mode boolean parameter. When true:
  - CBE account number validation is skipped (any value accepted)
  - CBE Transaction ID format validation is skipped (any non-empty ref accepted)
  - Telebirr Transaction ID format validation is skipped (any non-empty ref accepted)
  - The unique-transaction-reference check is skipped (duplicate refs allowed)

This lets cashiers/admins submit test orders with dummy references like FT123456789
without real bank confirmation. Production orders should never use test mode.
*/

DROP FUNCTION IF EXISTS submit_sale(
  uuid, text, text, text, text, text, text, uuid, numeric, text, numeric, numeric, text, numeric, text, text, uuid
);

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
  p_vehicle_id uuid,
  p_test_mode boolean DEFAULT false
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
  IF p_test_mode = false THEN
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
  ELSE
    -- Test mode: still require a non-empty ref for telebirr/cbe, but accept any format
    IF p_payment_method IN ('telebirr', 'cbe_bank') AND v_ref = '' THEN
      RAISE EXCEPTION 'A transaction reference is required even in test mode.';
    END IF;
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
    CASE WHEN p_payment_method = 'cbe_bank' THEN regexp_replace(coalesce(p_paid_to_account, ''), '\D', '', 'g') ELSE NULL END,
    p_vehicle_id, v_addr, trim(p_customer_city), trim(p_customer_kebele), trim(p_customer_area), v_maps,
    'pending_verification'
  ) RETURNING * INTO v_sale;

  PERFORM deduct_stock(p_material_id, p_quantity);

  PERFORM notify(ARRAY['admin'], 'pending',
    CASE WHEN p_payment_method = 'credit' THEN 'CREDIT sale needs your approval' ELSE 'Payment awaiting verification' END,
    'ክፍያ ማረጋገጫ ይጠብቃል',
    v_sale.invoice_number || ' · ' || v_sale.customer_name || ' · truck ' || v_veh.plate_number ||
      CASE WHEN p_test_mode THEN ' [TEST MODE]' ELSE '' END ||
      ' — Pending Admin Verification', v_sale.id);
  PERFORM notify(ARRAY['cashier'], 'info', 'Submitted for verification', 'ለማረጋገጣ ተልኳል',
    v_sale.invoice_number || ' sent to admin. Truck ' || v_veh.plate_number || ' reserved.' ||
      CASE WHEN p_test_mode THEN ' [TEST MODE]' ELSE '' END, v_sale.id);

  RETURN v_sale;
END;
$$;

GRANT EXECUTE ON FUNCTION
  submit_sale(uuid, text, text, text, text, text, text, uuid, numeric, text, numeric, numeric, text, numeric, text, text, uuid, boolean)
TO anon, authenticated;
