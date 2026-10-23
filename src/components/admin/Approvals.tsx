import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ClipboardCheck, Mail, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { approveSale, rejectSale, sendApprovalEmail } from '@/lib/db';
import { useRealtimeRefresh } from '@/lib/realtime';
import { useAdminAuth } from '@/lib/adminAuth';
import { fmtETB, fmtNum, fmtDateTime } from '@/lib/format';
import { PAYMENT_METHOD_LABELS, SALE_STATUS_LABELS, type SaleWithRelations } from '@/lib/types';
import { Card, Button, Badge, Spinner, EmptyState, inputClass } from '@/components/ui';

export default function Approvals() {
  const { user } = useAdminAuth();
  const [pending, setPending] = useState<SaleWithRelations[]>([]);
  const [history, setHistory] = useState<SaleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [p, h] = await Promise.all([
      supabase
        .from('sales')
        .select('*, vehicle:vehicles(*), gate_passes(*)')
        .eq('dispatch_status', 'pending_verification')
        .order('created_at', { ascending: true }),
      supabase
        .from('sales')
        .select('*, vehicle:vehicles(*), gate_passes(*)')
        .in('dispatch_status', ['approved', 'rejected', 'exited', 'completed'])
        .order('created_at', { ascending: false })
        .limit(15),
    ]);
    setPending((p.data ?? []) as unknown as SaleWithRelations[]);
    setHistory((h.data ?? []) as unknown as SaleWithRelations[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(['sales'], load);

  async function approve(s: SaleWithRelations) {
    if (!user) return;
    if (
      s.payment_method === 'credit' &&
      !window.confirm(`CREDIT sale ${s.invoice_number}: ${fmtETB(s.balance_due)} ETB will be owed by ${s.customer_name}. Approve on credit?`)
    )
      return;
    setMsg(null);
    setBusyId(s.id);
    try {
      await approveSale(user.id, s.id);
      const mail = await sendApprovalEmail(s.id);
      setMsg({ ok: true, text: `${s.invoice_number} approved. ${mail.message}` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Approval failed.' });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(s: SaleWithRelations) {
    if (!user) return;
    setMsg(null);
    setBusyId(s.id);
    try {
      await rejectSale(user.id, s.id, reason);
      setMsg({ ok: true, text: `${s.invoice_number} rejected. Truck is Available again.` });
      setRejectId(null);
      setReason('');
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Rejection failed.' });
    } finally {
      setBusyId(null);
    }
  }

  async function resend(s: SaleWithRelations) {
    setBusyId(s.id);
    const r = await sendApprovalEmail(s.id, true);
    setMsg({ ok: r.ok, text: r.message });
    setBusyId(null);
    await load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-7 h-7" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {msg && (
        <div
          className={`text-sm rounded-xl px-4 py-3 border ${
            msg.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-600 bg-red-50 border-red-100'
          }`}
        >
          {msg.text}
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Payments Awaiting Verification</h3>
            <p className="am text-xs text-slate-500">ማረጋገጫ የሚጠብቁ ክፍያዎች</p>
          </div>
          <Badge tone="amber">{pending.length}</Badge>
        </div>

        {pending.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="All caught up" subtitle="New cashier submissions appear here instantly." />
        ) : (
          <div className="space-y-4">
            {pending.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono font-bold">{s.invoice_number}</div>
                    <div className="am text-sm text-slate-700 dark:text-slate-200">{s.customer_name}</div>
                    <div className="text-xs text-slate-400">{fmtDateTime(s.created_at)}</div>
                  </div>
                  <div className="text-right">
                    {s.payment_method === 'credit' && <div className="mb-1"><Badge tone="red">CREDIT — explicit admin approval</Badge></div>}
                    <div className="text-lg font-bold tabular-nums">{fmtETB(s.total)} ETB</div>
                    <Badge tone="amber">{SALE_STATUS_LABELS[s.dispatch_status].en}</Badge>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <Info label="Material" value={`${s.material_label} · ${fmtNum(s.quantity)} ${s.unit}`} am />
                  <Info
                    label="Payment"
                    value={`${PAYMENT_METHOD_LABELS[s.payment_method]}${
                      s.payment_method === 'credit' ? ` · paid ${fmtETB(s.amount_paid)}` : ''
                    }`}
                  />
                  <Info label="Transaction Ref" value={s.transaction_ref ?? '—'} mono />
                  {s.payment_method === 'cbe_bank' && <Info label="Paid to Account" value={s.paid_to_account ?? '—'} mono />}
                  <Info
                    label="Truck"
                    value={`${s.vehicle?.plate_number ?? '—'} · ${s.vehicle?.driver_name ?? ''} · ${s.vehicle?.driver_phone ?? ''}`}
                    am
                  />
                  <Info label="Delivery Address" value={s.destination ?? '—'} am />
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Google Maps</div>
                    {s.maps_link ? (
                      <a href={s.maps_link} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline font-medium">
                        Open navigation link
                      </a>
                    ) : (
                      <span className="text-red-500 font-medium">Missing — cannot approve</span>
                    )}
                  </div>
                  {s.customer_email && <Info label="Customer Email" value={s.customer_email} />}
                </div>

                {rejectId === s.id ? (
                  <div className="mt-4 space-y-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason (optional) — shown to the cashier"
                      className={inputClass}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button variant="danger" loading={busyId === s.id} onClick={() => reject(s)}>
                        <XCircle className="w-4 h-4" /> Confirm Reject
                      </Button>
                      <Button variant="ghost" onClick={() => { setRejectId(null); setReason(''); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-3">
                    <Button loading={busyId === s.id} disabled={!s.maps_link} onClick={() => approve(s)}>
                      <CheckCircle2 className="w-4 h-4" /> Approve · አጽድቅ
                    </Button>
                    <Button variant="ghost" disabled={busyId === s.id} onClick={() => setRejectId(s.id)}>
                      <XCircle className="w-4 h-4" /> Reject · ውድቅ አድርግ
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-3">Recent decisions</h3>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2 pr-3">Invoice</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Email</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {history.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-3 font-mono text-xs">{s.invoice_number}</td>
                    <td className="py-2 pr-3 am">{s.customer_name}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={SALE_STATUS_LABELS[s.dispatch_status].tone}>{SALE_STATUS_LABELS[s.dispatch_status].en}</Badge>
                      {s.rejection_reason && <div className="text-[11px] text-red-500 mt-0.5">{s.rejection_reason}</div>}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {s.dispatch_status === 'rejected' ? '—' : (
                        <span className={s.email_status === 'sent' ? 'text-emerald-600' : s.email_status === 'failed' ? 'text-red-500' : 'text-slate-400'}>
                          {s.email_status ?? 'not sent'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {s.dispatch_status !== 'rejected' && (
                        <button
                          disabled={busyId === s.id}
                          onClick={() => resend(s)}
                          className="text-xs font-semibold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {busyId === s.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                          {s.email_status === 'sent' ? 'Resend' : 'Send email'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Info({ label, value, mono, am }: { label: string; value: string; mono?: boolean; am?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
      <div className={`text-slate-800 dark:text-slate-100 font-medium break-words ${mono ? 'font-mono' : ''} ${am ? 'am' : ''}`}>{value}</div>
    </div>
  );
}
