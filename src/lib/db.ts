import { supabase } from './supabase';
import { num } from './format';
import type { GatePass, Sale, Vehicle } from './types';

// Postgres `RAISE EXCEPTION` messages arrive as error.message — show them as-is.
function fail(error: { message: string } | null): never {
  throw new Error(error?.message ?? 'Request failed.');
}

/* ----------------------------- Sales workflow ----------------------------- */

export type SaleInput = {
  staff_id?: string | null;
  customer_name: string;
  customer_email?: string | null;
  material_id: string;
  quantity: number;
  unit: string;
  unit_price: number;
  transport_fee: number;
  payment_method: 'telebirr' | 'cbe_bank' | 'credit';
  amount_paid: number;
  transaction_ref?: string | null;
  paid_to_account?: string | null;
  vehicle_id: string;
  customer_city: string;
  customer_kebele: string;
  customer_area: string;
  maps_link: string;
  test_mode?: boolean;
};

/** Cashier submission → status "Pending Admin Verification", truck reserved. */
export async function submitSale(input: SaleInput): Promise<Sale> {
  const { data, error } = await supabase.rpc('submit_sale', {
    p_staff_id: input.staff_id ?? null,
    p_customer_name: input.customer_name,
    p_customer_email: input.customer_email ?? null,
    p_material_id: input.material_id,
    p_quantity: num(input.quantity),
    p_unit: input.unit,
    p_unit_price: num(input.unit_price),
    p_transport_fee: num(input.transport_fee),
    p_payment_method: input.payment_method,
    p_amount_paid: num(input.amount_paid),
    p_transaction_ref: input.transaction_ref ?? null,
    p_paid_to_account: input.paid_to_account ?? null,
    p_vehicle_id: input.vehicle_id,
    p_customer_city: input.customer_city,
    p_customer_kebele: input.customer_kebele,
    p_customer_area: input.customer_area,
    p_maps_link: input.maps_link,
    p_test_mode: input.test_mode ?? false,
  });
  if (error) fail(error);
  return data as Sale;
}

export async function approveSale(staffId: string, saleId: string) {
  const { data, error } = await supabase.rpc('approve_sale', { p_staff_id: staffId, p_sale_id: saleId });
  if (error) fail(error);
  return data as { sale: Sale; gate_pass: GatePass };
}

export async function rejectSale(staffId: string, saleId: string, reason: string) {
  const { data, error } = await supabase.rpc('reject_sale', {
    p_staff_id: staffId,
    p_sale_id: saleId,
    p_reason: reason,
  });
  if (error) fail(error);
  return data as Sale;
}

export async function confirmExit(saleId: string) {
  const { data, error } = await supabase.rpc('confirm_exit', { p_sale_id: saleId });
  if (error) fail(error);
  return data as Sale;
}

export async function confirmReturn(saleId: string) {
  const { data, error } = await supabase.rpc('confirm_return', { p_sale_id: saleId });
  if (error) fail(error);
  return data as Sale;
}

/** Ask the edge function to email receipt + gate pass details. Never throws. */
export async function sendApprovalEmail(
  saleId: string,
  force = false,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-approval-email', {
      body: { sale_id: saleId, force },
    });
    if (error) return { ok: false, message: 'Email could not be sent. Check the edge function setup.' };
    if (data?.sent_to) return { ok: true, message: `Email sent to ${(data.sent_to as string[]).join(', ')}.` };
    if (data?.skipped === 'no recipient')
      return { ok: true, message: 'No email address on file — email skipped.' };
    if (data?.error) return { ok: false, message: String(data.error) };
    return { ok: true, message: 'Email already sent.' };
  } catch {
    return { ok: false, message: 'Email could not be sent.' };
  }
}

/* -------------------------------- Vehicles -------------------------------- */

export async function saveVehicle(
  staffId: string,
  v: { id?: string | null; plate_number: string; driver_name: string; driver_phone: string; vehicle_model: string },
): Promise<Vehicle> {
  const { data, error } = await supabase.rpc('vehicle_save', {
    p_staff_id: staffId,
    p_id: v.id ?? null,
    p_plate: v.plate_number,
    p_driver: v.driver_name,
    p_phone: v.driver_phone,
    p_model: v.vehicle_model,
  });
  if (error) fail(error);
  return data as Vehicle;
}

export async function deleteVehicle(staffId: string, id: string) {
  const { error } = await supabase.rpc('vehicle_delete', { p_staff_id: staffId, p_id: id });
  if (error) fail(error);
}

/* --------------------------------- Ledger --------------------------------- */

export async function recordPayment(input: {
  customer_id: string;
  sale_id?: string | null;
  amount: number;
  method: 'telebirr' | 'cbe_bank';
  note?: string;
}) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      customer_id: input.customer_id,
      sale_id: input.sale_id ?? null,
      amount: num(input.amount),
      method: input.method,
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
