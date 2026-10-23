# Garvelgo Material Supply — Sales, Truck & Gate System

## Workflow

1. **Admin** registers trucks (plate, driver, phone, model) under **Trucks & Settings** → status `Available`.
2. **Cashier** (POS) fills in the sale, picks an **Available** truck from the drop-down (no free typing) and submits.
   Sale → `Pending Admin Verification`, truck is reserved.
3. **Admin** (Payment Approvals) verifies the payment → **Approve** or **Reject**.
   - Approve → `Approved / Ready for Exit`, gate pass is created, receipt + gate pass are emailed.
   - Reject → truck becomes `Available` again and stock is restored.
4. **Security** (Gate Pass & Trucks): **Confirm Exit** (`ወጥቷል / Exited`) → **Confirm Return** (`ተመልሷል`) → truck is `Available / ዝግጁ ነው` and shows up in the cashier drop-down again.
5. Everyone gets live in-app alerts (bell + toast) on each status change.

## Delivery address & navigation

The cashier must enter City, Kebele, Specific Area/Sefer and a Google Maps link (or `lat,lng` pin). On approval the
address and link are copied onto the gate pass and into the approval email (clickable "Open in Google Maps" button).
Security's truck cards also have a **Navigate** link.

## Payment rules

- Telebirr: `0942836279` (Garvelgo Material Supply)
- CBE: `1000474209637` (Garvelgo Material Supply). The cashier must enter the account number shown on the customer's receipt; anything else is rejected with the Amharic error message (checked in the UI, the `submit_sale` function and a DB trigger).
- CBE Transaction ID is required and must match `FT` + 8–14 letters/digits (edit `CBE_TXN_ID_PATTERN` in `src/lib/location.ts` and the regex in `submit_sale` if your receipts differ). A transaction ID can only be used once.
- Cash is removed. Credit needs an admin-authorized user (admin signed in).

## Setup

```bash
npm install
# 1. Apply DB migrations (Supabase SQL editor or CLI)
supabase db push
# 2. Email function (Resend)
supabase secrets set RESEND_API_KEY=... MAIL_FROM="Garvelgo Material Supply <noreply@your-domain.com>" ADMIN_NOTIFY_EMAIL=you@example.com
supabase functions deploy send-approval-email
npm run dev
```

Realtime: the migration adds `notifications`, `sales`, `vehicles` to the `supabase_realtime` publication.
(If it fails, enable Realtime for those tables in the dashboard. The app also polls every 15–20 s as a fallback.)

## Admin access

- Default admin: `admin` / `ChangeMe123!` (must be changed on first login).
- Forgot password → **Forgot password?** on the admin login → enter the recovery key.
  Default recovery key: `GARVELGO-RESET-2026`. **Change it** under Trucks & Settings → *Admin recovery key*.

## Security note

This app has no Supabase Auth: staff identity is the staff id kept in the browser, and Security/Cashier are session roles.
Admin-only actions (approve, reject, truck management, credit) are checked server-side against that staff id,
but a determined person with the public anon key could still call exit/return directly. For stronger guarantees,
move staff to Supabase Auth and tighten the RLS policies.
