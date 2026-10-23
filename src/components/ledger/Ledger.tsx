import { useEffect, useMemo, useState } from 'react';
import { BookUser, Plus, Search, Wallet, TrendingDown, ArrowDownCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { recordPayment } from '@/lib/db';
import { fmtETB, fmtDate, fmtDateTime } from '@/lib/format';
import type { Customer, Sale, Payment } from '@/lib/types';
import { Card, Button, Field, inputClass, Badge, Spinner, EmptyState } from '@/components/ui';

type LedgerRow = {
  customer: Customer;
  totalPurchases: number;
  totalPaid: number;
  balance: number;
  salesCount: number;
};

export default function Ledger() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LedgerRow | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  // new customer
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [custErr, setCustErr] = useState<string | null>(null);
  const [custLoading, setCustLoading] = useState(false);

  // payment
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'telebirr' | 'cbe_bank'>('telebirr');
  const [payNote, setPayNote] = useState('');
  const [payErr, setPayErr] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [c, s, p] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('sales').select('*').neq('dispatch_status', 'rejected').order('created_at', { ascending: false }),
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
    ]);
    setCustomers(c.data ?? []);
    setSales(s.data ?? []);
    setPayments(p.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const rows: LedgerRow[] = useMemo(() => {
    return customers.map((customer) => {
      const cSales = sales.filter((s) => s.customer_id === customer.id);
      const totalPurchases = cSales.reduce((sum, s) => sum + Number(s.total), 0);
      const paidOnSales = cSales.reduce((sum, s) => sum + Number(s.amount_paid), 0);
      const repayments = payments
        .filter((p) => p.customer_id === customer.id)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const totalPaid = paidOnSales + repayments;
      const balance = totalPurchases - totalPaid;
      return { customer, totalPurchases, totalPaid, balance, salesCount: cSales.length };
    });
  }, [customers, sales, payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.customer.name.toLowerCase().includes(q) || (r.customer.phone ?? '').includes(q));
  }, [rows, search]);

  const selectedSales = useMemo(
    () => (selected ? sales.filter((s) => s.customer_id === selected.customer.id) : []),
    [selected, sales]
  );
  const selectedPayments = useMemo(
    () => (selected ? payments.filter((p) => p.customer_id === selected.customer.id) : []),
    [selected, payments]
  );

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    setCustErr(null);
    if (!newName.trim()) return setCustErr('Customer name is required.');
    setCustLoading(true);
    try {
      const { error } = await supabase.from('customers').insert({
        name: newName.trim(),
        phone: newPhone.trim() || null,
        credit_limit: Number(newLimit || 0),
      });
      if (error) throw error;
      setNewName('');
      setNewPhone('');
      setNewLimit('');
      setShowAddCustomer(false);
      await load();
    } catch (err) {
      setCustErr(err instanceof Error ? err.message : 'Failed to add customer.');
    } finally {
      setCustLoading(false);
    }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setPayErr(null);
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return setPayErr('Enter a valid amount.');
    if (!selected) return;
    setPayLoading(true);
    try {
      await recordPayment({
        customer_id: selected.customer.id,
        amount: amt,
        method: payMethod,
        note: payNote.trim() || undefined,
      });
      setPayAmount('');
      setPayNote('');
      setShowPayment(false);
      await load();
    } catch (err) {
      setPayErr(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setPayLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-7 h-7" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={BookUser} label="Credit Customers" am="የብድር ደንበኞች" value={`${customers.length}`} accent="from-sky-400 to-blue-500" />
        <SummaryCard icon={TrendingDown} label="Total Outstanding" am="ጠቅላላ ቀሪ ብድር" value={`${fmtETB(rows.reduce((s, r) => s + r.balance, 0))} ETB`} accent="from-rose-400 to-red-500" />
        <SummaryCard icon={Wallet} label="Total Credit Limit" am="ጠቅላላ የብድር ገደብ" value={`${fmtETB(rows.reduce((s, r) => s + Number(r.customer.credit_limit), 0))} ETB`} accent="from-amber-400 to-orange-500" />
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="font-bold text-slate-900">Customer Ledger</h3>
            <p className="am text-xs text-slate-500">የብድር እና ኮንትራክተሮች መዝገብ</p>
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer..."
                className={`${inputClass} pl-9 sm:w-56`}
              />
            </div>
            <Button onClick={() => setShowAddCustomer(true)}>
              <Plus className="w-4 h-4" /> Add Customer
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={BookUser} title="No customers yet" subtitle="Add a credit customer to start tracking balances." />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold text-right">Purchases</th>
                  <th className="px-3 py-2 font-semibold text-right">Paid</th>
                  <th className="px-3 py-2 font-semibold text-right">Balance</th>
                  <th className="px-3 py-2 font-semibold text-right">Credit Limit</th>
                  <th className="px-3 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => {
                  const overLimit = r.balance > Number(r.customer.credit_limit);
                  return (
                    <tr key={r.customer.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setSelected(r)}>
                      <td className="px-3 py-3">
                        <div className="am font-semibold text-slate-800">{r.customer.name}</div>
                        <div className="text-[11px] text-slate-400">{r.customer.phone || '—'} · {r.salesCount} sale{r.salesCount === 1 ? '' : 's'}</div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtETB(r.totalPurchases)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtETB(r.totalPaid)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className={`font-bold ${r.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtETB(r.balance)}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                        {fmtETB(Number(r.customer.credit_limit))}
                        {overLimit && <Badge tone="red">over limit</Badge>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelected(r); setShowPayment(true); }}
                          className="text-xs font-semibold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
                        >
                          <ArrowDownCircle className="w-3.5 h-3.5" /> Repay
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Customer detail drawer */}
      {selected && !showPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
              <div>
                <h3 className="am font-bold text-slate-900">{selected.customer.name}</h3>
                <p className="text-xs text-slate-500">{selected.customer.phone || 'No phone'}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowPayment(true)}><ArrowDownCircle className="w-4 h-4" /> Record Repayment</Button>
                <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3 mb-5">
                <Stat label="Total Purchases" value={`${fmtETB(selected.totalPurchases)} ETB`} />
                <Stat label="Total Paid" value={`${fmtETB(selected.totalPaid)} ETB`} />
                <Stat label="Outstanding" value={`${fmtETB(selected.balance)} ETB`} danger={selected.balance > 0} />
              </div>

              <h4 className="text-sm font-bold text-slate-800 mb-2">Purchase History</h4>
              <div className="space-y-1.5 mb-5">
                {selectedSales.length === 0 ? (
                  <p className="text-xs text-slate-400">No purchases yet.</p>
                ) : (
                  selectedSales.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-50">
                      <div>
                        <div className="font-mono text-xs text-slate-500">{s.invoice_number}</div>
                        <div className="am text-slate-700">{s.material_label} · {fmtDate(s.created_at)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{fmtETB(s.total)}</div>
                        <Badge tone={s.status === 'paid' ? 'green' : s.status === 'partial' ? 'amber' : 'red'}>{s.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <h4 className="text-sm font-bold text-slate-800 mb-2">Repayment History</h4>
              <div className="space-y-1.5">
                {selectedPayments.length === 0 ? (
                  <p className="text-xs text-slate-400">No repayments recorded.</p>
                ) : (
                  selectedPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-50">
                      <div>
                        <div className="text-slate-700">{fmtDate(p.created_at)} · {p.method}</div>
                        {p.note && <div className="text-[11px] text-slate-400 am">{p.note}</div>}
                      </div>
                      <div className="font-semibold tabular-nums text-emerald-600">{fmtETB(p.amount)} ETB</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add customer modal */}
      {showAddCustomer && (
        <Modal title="Add Credit Customer" amTitle="አዲስ ደንበኛ" onClose={() => setShowAddCustomer(false)}>
          <form onSubmit={handleAddCustomer} className="space-y-4">
            <Field label="Customer / Company Name" amLabel="ስም">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className={`${inputClass} am`} placeholder="አበበ ግንባታ" />
            </Field>
            <Field label="Phone (optional)" amLabel="ስልክ">
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className={inputClass} placeholder="0911..." />
            </Field>
            <Field label="Credit Limit (ETB)" amLabel="የብድር ገደብ">
              <input type="number" min="0" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} className={inputClass} placeholder="0" />
            </Field>
            {custErr && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{custErr}</div>}
            <div className="flex gap-3">
              <Button type="submit" loading={custLoading} className="flex-1">Add Customer</Button>
              <Button variant="ghost" type="button" onClick={() => setShowAddCustomer(false)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Payment modal */}
      {showPayment && selected && (
        <Modal title={`Repayment — ${selected.customer.name}`} amTitle="የብድር ክፍያ" onClose={() => setShowPayment(false)}>
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-between">
            <span className="text-sm text-rose-700">Outstanding balance</span>
            <span className="font-bold tabular-nums text-rose-700">{fmtETB(selected.balance)} ETB</span>
          </div>
          <form onSubmit={handlePayment} className="space-y-4">
            <Field label="Amount (ETB)" amLabel="መጠን">
              <input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputClass} placeholder="0.00" />
            </Field>
            <Field label="Method" amLabel="ዘዴ">
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'telebirr' | 'cbe_bank')} className={inputClass}>
                <option value="telebirr">Telebirr</option>
                <option value="cbe_bank">CBE Bank</option>
              </select>
            </Field>
            <Field label="Note (optional)" amLabel="ማስታወሻ">
              <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className={`${inputClass} am`} placeholder="..." />
            </Field>
            {payErr && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{payErr}</div>}
            <div className="flex gap-3">
              <Button type="submit" loading={payLoading} className="flex-1">Record Repayment</Button>
              <Button variant="ghost" type="button" onClick={() => setShowPayment(false)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, am, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; am: string; value: string; accent: string }) {
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center shrink-0`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
        <div className="am text-[11px] text-slate-400 -mt-0.5">{am}</div>
        <div className="text-lg font-bold tabular-nums truncate">{value}</div>
      </div>
    </Card>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
      <div className={`text-base font-bold tabular-nums ${danger ? 'text-rose-600' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function Modal({ title, amTitle, children, onClose }: { title: string; amTitle: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">{title}</h3>
            <p className="am text-xs text-slate-500">{amTitle}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
