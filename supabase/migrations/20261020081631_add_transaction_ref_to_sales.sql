/*
# Add transaction_ref column to sales

Adds a `transaction_ref` column to the `sales` table to store the payment
reference number required for Telebirr and CBE Bank transfers.

## Changes
1. `sales` table — new column:
   - transaction_ref (text, nullable) — the payment confirmation / reference
     number provided by the customer when paying via Telebirr or CBE Bank.
     Null for cash and credit sales.

## Security
No policy changes. The existing anon RLS policies already cover the new column
since they are row-level (not column-level).
*/

ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_ref text;
