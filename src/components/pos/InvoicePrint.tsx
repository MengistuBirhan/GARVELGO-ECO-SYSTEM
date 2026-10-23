import { HardHat, MapPin } from 'lucide-react';
import { fmtETB, fmtNum, fmtDateTime } from '@/lib/format';
import {
  merchantFor,
  PAYMENT_METHOD_LABELS,
  type Sale,
} from '@/lib/types';
import { PrintFooter } from '@/components/Footer';

const COMPANY = {
  name: 'GARVELGO SYSTEM',
  am: 'የግንባታ እቃ ሽያጭ እና መቆጣጠሪያ ሲስተም',
  phone: '+251 91 000 0000',
  address: 'Addis Ababa, Ethiopia',
};

export default function InvoicePrint({ sale, forPrint = false }: { sale: Sale; forPrint?: boolean }) {
  const merchant = merchantFor(sale.payment_method);
  const hasRef = !!merchant && !!sale.transaction_ref;
  return (
    <div className={forPrint ? 'p-8 font-sans text-slate-900' : 'rounded-xl border border-slate-200 p-6'}>
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <HardHat className="w-7 h-7 text-slate-900" strokeWidth={2.2} />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">{COMPANY.name}</div>
            <div className="am text-sm text-slate-600">{COMPANY.am}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{COMPANY.address} · {COMPANY.phone}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight">INVOICE</div>
          <div className="am text-xs text-slate-500">ደረሰኝ</div>
          <div className="font-mono text-sm mt-1">{sale.invoice_number}</div>
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-4 py-4 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Customer</div>
          <div className="am font-semibold text-slate-800">{sale.customer_name}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Date</div>
          <div className="text-slate-800">{fmtDateTime(sale.created_at)}</div>
        </div>
      </div>

      {/* Line item */}
      <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
        <thead className="bg-slate-50">
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Material</th>
            <th className="px-3 py-2 font-semibold text-right">Qty</th>
            <th className="px-3 py-2 font-semibold text-right">Unit Price</th>
            <th className="px-3 py-2 font-semibold text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-slate-200">
            <td className="px-3 py-3 am font-medium text-slate-800">{sale.material_label}</td>
            <td className="px-3 py-3 text-right tabular-nums">{fmtNum(sale.quantity)} {sale.unit}</td>
            <td className="px-3 py-3 text-right tabular-nums">{fmtETB(sale.unit_price)}</td>
            <td className="px-3 py-3 text-right tabular-nums font-semibold">{fmtETB(sale.subtotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mt-4">
        <div className="w-full max-w-xs space-y-1.5 text-sm">
          <Row label="Subtotal" am="ትንብዮት" value={`${fmtETB(sale.subtotal)} ETB`} />
          <Row label="Transport Fee" am="የማጓጓዣ ዋጋ" value={`${fmtETB(sale.transport_fee)} ETB`} />
          <div className="border-t border-slate-300 pt-2 mt-2">
            <Row label="TOTAL" am="ድምር" value={`${fmtETB(sale.total)} ETB`} bold />
          </div>
          <Row label="Payment Method" am="የክፍያ ዘዴ" value={PAYMENT_METHOD_LABELS[sale.payment_method]} />
          {hasRef && merchant && (
            <Row
              label={merchant.refLabel}
              am={merchant.refAmLabel}
              value={sale.transaction_ref!}
            />
          )}
          <Row label="Amount Paid" am="የተከፈለ" value={`${fmtETB(sale.amount_paid)} ETB`} />
          {Number(sale.balance_due) > 0 && (
            <Row label="Balance Due" am="ቀሪ ብድር" value={`${fmtETB(sale.balance_due)} ETB`} danger />
          )}
        </div>
      </div>

      {/* Payment details box for Telebirr / CBE Bank */}
      {hasRef && merchant && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">
            Payment Details · <span className="am">የክፍያ ዝርዝር</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-slate-400">Bank / Provider</div>
              <div className="font-semibold text-slate-800">{merchant.label}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Account Name</div>
              <div className="am font-semibold text-slate-800">{merchant.accountName}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Account / Till</div>
              <div className="font-mono font-semibold text-slate-800">{merchant.accountNumber}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">{merchant.refLabel}</div>
              <div className="font-mono font-semibold text-slate-800">{sale.transaction_ref}</div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-slate-200 text-center">
        <div className="am text-sm text-slate-600">እባክዎ ደረሰኙን ጠብቀው ይዘው ይስሉ።</div>
        <div className="text-[11px] text-slate-400 mt-1">Please retain this invoice for your records.</div>
        <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 mt-2">
          <MapPin className="w-3 h-3" /> {COMPANY.address}
        </div>
      </div>
      <PrintFooter />
    </div>
  );
}

function Row({ label, am, value, bold, danger }: { label: string; am: string; value: string; bold?: boolean; danger?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'text-base' : ''}`}>
      <span className="text-slate-600">
        {label} <span className="am text-slate-400 text-xs">· {am}</span>
      </span>
      <span className={`tabular-nums font-semibold ${danger ? 'text-red-600' : bold ? 'text-slate-900' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}
