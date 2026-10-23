// Supabase Edge Function: send-approval-email
//
// Called by the admin UI right after `approve_sale`. Sends the receipt +
// gate-pass details by email through Resend (https://resend.com).
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY      required – Resend API key
//   MAIL_FROM           required – e.g. "Garvelgo Material Supply <noreply@yourdomain.com>"
//   ADMIN_NOTIFY_EMAIL  optional – always receives a copy (comma separated)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Recipients: the customer's email (if the cashier entered one) + ADMIN_NOTIFY_EMAIL.
// A sale is emailed at most once unless { force: true } is passed (used by the
// "Resend email" button).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const esc = (v: unknown) =>
  String(v ?? '—').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const etb = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

const METHODS: Record<string, string> = {
  telebirr: 'Telebirr / ቴሌ ብር',
  cbe_bank: 'CBE Bank / ንግድ ባንክ',
  credit: 'Credit / በብድር',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { sale_id, force } = await req.json();
    if (!sale_id) return json({ error: 'sale_id is required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: sale, error } = await supabase
      .from('sales')
      .select('*, vehicle:vehicles(*), gate_passes(*)')
      .eq('id', sale_id)
      .maybeSingle();
    if (error || !sale) return json({ error: 'Sale not found' }, 404);

    if (!['approved', 'exited', 'completed'].includes(sale.dispatch_status)) {
      return json({ error: 'Sale has not been approved' }, 409);
    }

    // Claim the send so double clicks cannot produce duplicate emails.
    let claim = supabase
      .from('sales')
      .update({ email_status: 'sending', email_error: null })
      .eq('id', sale_id);
    claim = force
      ? claim.neq('email_status', 'sending')
      : claim.is('email_sent_at', null).or('email_status.is.null,email_status.in.(failed,skipped)');
    const { data: claimed } = await claim.select('id');
    if (!claimed || claimed.length === 0) return json({ ok: true, skipped: 'already sent or in progress' });

    const recipients = [
      sale.customer_email,
      ...(Deno.env.get('ADMIN_NOTIFY_EMAIL') ?? '').split(','),
    ]
      .map((e: string | null) => (e ?? '').trim())
      .filter((e: string, i: number, a: string[]) => e && a.indexOf(e) === i);

    if (recipients.length === 0) {
      await supabase.from('sales').update({ email_status: 'skipped', email_error: 'No recipient email' }).eq('id', sale_id);
      return json({ ok: true, skipped: 'no recipient' });
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('MAIL_FROM');
    if (!apiKey || !from) {
      await supabase.from('sales').update({ email_status: 'failed', email_error: 'Email provider not configured' }).eq('id', sale_id);
      return json({ error: 'RESEND_API_KEY / MAIL_FROM not configured' }, 500);
    }

    const pass = (sale.gate_passes ?? [])[0];
    const veh = sale.vehicle ?? {};
    const row = (k: string, v: unknown) =>
      `<tr><td style="padding:6px 12px;color:#64748b">${k}</td><td style="padding:6px 12px;font-weight:600;color:#0f172a">${esc(v)}</td></tr>`;

    const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
  <h2 style="margin:0 0 4px">Garvelgo Material Supply</h2>
  <p style="margin:0 0 16px;color:#64748b">Payment approved · ክፍያዎ ጸድቋል</p>

  <h3 style="margin:16px 0 4px">Receipt / ደረሰኝ</h3>
  <table style="border-collapse:collapse;width:100%;background:#f8fafc;border-radius:8px">
    ${row('Invoice', sale.invoice_number)}
    ${row('Customer', sale.customer_name)}
    ${row('Material', sale.material_label)}
    ${row('Quantity', `${sale.quantity} ${sale.unit}`)}
    ${row('Unit price', `${etb(sale.unit_price)} ETB`)}
    ${row('Transport fee', `${etb(sale.transport_fee)} ETB`)}
    ${row('Total', `${etb(sale.total)} ETB`)}
    ${row('Payment method', METHODS[sale.payment_method] ?? sale.payment_method)}
    ${row('Transaction ref', sale.transaction_ref)}
    ${row('Approved at', sale.approved_at ? new Date(sale.approved_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—')}
  </table>

  <h3 style="margin:16px 0 4px">Gate pass / የበር መውጫ</h3>
  <table style="border-collapse:collapse;width:100%;background:#fffbeb;border-radius:8px">
    ${row('Gate pass #', pass?.pass_number)}
    ${row('Truck plate', veh.plate_number ?? pass?.truck_plate)}
    ${row('Vehicle model', veh.vehicle_model ?? pass?.vehicle_model)}
    ${row('Driver', veh.driver_name ?? pass?.driver_name)}
    ${row('Driver phone', veh.driver_phone ?? pass?.driver_phone)}
    ${row('Delivery address', pass?.customer_address ?? sale.destination)}
  </table>

  ${
    (pass?.maps_link ?? sale.maps_link)
      ? `<div style="margin-top:12px;padding:14px;background:#eff6ff;border-radius:8px;text-align:center">
    <a href="${esc(pass?.maps_link ?? sale.maps_link)}"
       style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">
      📍 Open in Google Maps · መንገድ ክፈት
    </a>
    <p style="margin:10px 0 0;font-size:12px;color:#475569;word-break:break-all">${esc(pass?.maps_link ?? sale.maps_link)}</p>
  </div>`
      : ''
  }

  <p style="margin-top:20px;font-size:12px;color:#94a3b8">
    Driver: tap the map button above to navigate to the delivery site. Present this gate pass number to security at the gate. · ይህንን የበር መውጫ ቁጥር ለጥበቃ ያሳዩ።
  </p>
</div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: `Payment approved · ${sale.invoice_number}${pass ? ` · Gate pass ${pass.pass_number}` : ''}`,
        html,
      }),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      await supabase.from('sales').update({ email_status: 'failed', email_error: detail }).eq('id', sale_id);
      return json({ error: 'Email provider rejected the message', detail }, 502);
    }

    await supabase
      .from('sales')
      .update({ email_status: 'sent', email_sent_at: new Date().toISOString(), email_error: null })
      .eq('id', sale_id);
    return json({ ok: true, sent_to: recipients });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
