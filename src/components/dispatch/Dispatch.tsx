import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, Navigation, Printer, Search, X, CheckCircle2, LogOut, LogIn, Clock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { confirmExit, confirmReturn } from '@/lib/db';
import { useRealtimeRefresh } from '@/lib/realtime';
import { fmtNum, fmtDateTime } from '@/lib/format';
import { useRole } from '@/lib/rbac';
import { SALE_STATUS_LABELS, type GatePass, type SaleWithRelations } from '@/lib/types';
import { Card, Button, inputClass, Badge, Spinner, EmptyState } from '@/components/ui';
import GatePassPrint from './GatePassPrint';

type Col = 'approved' | 'exited' | 'pending_verification' | 'recent';

export default function Dispatch() {
  const { role } = useRole();
  const canAct = role === 'gatekeeper' || role === 'admin';

  const [rows, setRows] = useState<SaleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printPass, setPrintPass] = useState<GatePass | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('sales')
      .select('*, vehicle:vehicles(*), gate_passes(*)')
      .or(`dispatch_status.in.(pending_verification,approved,exited),created_at.gte.${since}`)
      .order('created_at', { ascending: false })
      .limit(200);
    setRows((data ?? []) as unknown as SaleWithRelations[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(['sales', 'vehicles'], load);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.invoice_number} ${r.customer_name} ${r.vehicle?.plate_number ?? ''} ${r.vehicle?.driver_name ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const columns: Record<Col, SaleWithRelations[]> = useMemo(
    () => ({
      approved: filtered.filter((r) => r.dispatch_status === 'approved'),
      exited: filtered.filter((r) => r.dispatch_status === 'exited'),
      pending_verification: filtered.filter((r) => r.dispatch_status === 'pending_verification'),
      recent: filtered.filter((r) => r.dispatch_status === 'completed' || r.dispatch_status === 'rejected').slice(0, 15),
    }),
    [filtered],
  );

  async function act(kind: 'exit' | 'return', r: SaleWithRelations) {
    setError(null);
    setBusyId(r.id);
    try {
      if (kind === 'exit') await confirmExit(r.id);
      else await confirmReturn(r.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusyId(null);
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
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Gate Pass & Truck Tracking</h3>
            <p className="am text-xs text-slate-500">የበር መውጫ እና የመኪና ክትትል</p>
          </div>
          <div className="relative sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plate, driver, invoice..."
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>
        {!canAct && (
          <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> View only — only Security can confirm exit and return.
          </p>
        )}
        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Column
          title="Ready for Exit"
          am="ለመውጣት ዝግጁ"
          tone="green"
          items={columns.approved}
          empty="No approved trucks waiting."
          render={(r) => (
            <TruckCard
              key={r.id}
              r={r}
              onPrint={setPrintPass}
              action={
                canAct ? (
                  <Button className="w-full" loading={busyId === r.id} onClick={() => act('exit', r)}>
                    <LogOut className="w-4 h-4" /> Confirm Exit · ወጥቷል
                  </Button>
                ) : null
              }
            />
          )}
        />
        <Column
          title="Exited"
          am="ወጥተዋል"
          tone="blue"
          items={columns.exited}
          empty="No trucks currently out."
          render={(r) => (
            <TruckCard
              key={r.id}
              r={r}
              onPrint={setPrintPass}
              action={
                canAct ? (
                  <Button variant="secondary" className="w-full" loading={busyId === r.id} onClick={() => act('return', r)}>
                    <LogIn className="w-4 h-4" /> Confirm Return · ተመልሷል
                  </Button>
                ) : null
              }
            />
          )}
        />
        <Column
          title="Pending Admin Verification"
          am="ማረጋገጫ በመጠበቅ ላይ"
          tone="amber"
          items={columns.pending_verification}
          empty="Nothing awaiting verification."
          render={(r) => <TruckCard key={r.id} r={r} onPrint={setPrintPass} />}
        />
      </div>

      <Card className="p-5">
        <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-3">
          Recent history <span className="am text-xs font-normal text-slate-500">የቅርብ ጊዜ ታሪክ</span>
        </h3>
        {columns.recent.length === 0 ? (
          <EmptyState icon={Truck} title="No completed trips yet" subtitle="Returned and rejected trips appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2 pr-3">Invoice</th>
                  <th className="py-2 pr-3">Plate</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Exited</th>
                  <th className="py-2 pr-3">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {columns.recent.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 font-mono text-xs">{r.invoice_number}</td>
                    <td className="py-2 pr-3 font-mono font-semibold">{r.vehicle?.plate_number ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={SALE_STATUS_LABELS[r.dispatch_status].tone}>{SALE_STATUS_LABELS[r.dispatch_status].en}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{r.exited_at ? fmtDateTime(r.exited_at) : '—'}</td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{r.returned_at ? fmtDateTime(r.returned_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {printPass && (
        <>
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <div>
                    <h3 className="font-bold text-slate-900">Gate Pass</h3>
                    <p className="am text-xs text-slate-500">የበር መውጫ</p>
                  </div>
                </div>
                <button onClick={() => setPrintPass(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                <GatePassPrint pass={printPass} />
                <div className="flex gap-3 mt-5">
                  <Button onClick={() => window.print()} className="flex-1">
                    <Printer className="w-4 h-4" /> Print Gate Pass
                  </Button>
                  <Button variant="ghost" onClick={() => setPrintPass(null)}>Close</Button>
                </div>
              </div>
            </div>
          </div>
          <div id="print-area" className="hidden">
            <GatePassPrint pass={printPass} forPrint />
          </div>
        </>
      )}
    </div>
  );
}

function Column({
  title,
  am,
  tone,
  items,
  empty,
  render,
}: {
  title: string;
  am: string;
  tone: 'green' | 'blue' | 'amber';
  items: SaleWithRelations[];
  empty: string;
  render: (r: SaleWithRelations) => React.ReactNode;
}) {
  return (
    <Card className="p-4 self-start">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{title}</div>
          <div className="am text-[11px] text-slate-500">{am}</div>
        </div>
        <Badge tone={tone}>{items.length}</Badge>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? <p className="text-xs text-slate-400 text-center py-6">{empty}</p> : items.map(render)}
      </div>
    </Card>
  );
}

function TruckCard({
  r,
  action,
  onPrint,
}: {
  r: SaleWithRelations;
  action?: React.ReactNode;
  onPrint: (p: GatePass) => void;
}) {
  const pass = r.gate_passes?.[0];
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono font-bold text-slate-900 dark:text-slate-100">{r.vehicle?.plate_number ?? '—'}</div>
        <span className="font-mono text-[11px] text-slate-500">{r.invoice_number}</span>
      </div>
      <div className="text-xs text-slate-600 dark:text-slate-300">
        <span className="am font-semibold">{r.vehicle?.driver_name ?? '—'}</span>
        {r.vehicle?.driver_phone ? ` · ${r.vehicle.driver_phone}` : ''}
        {r.vehicle?.vehicle_model ? ` · ${r.vehicle.vehicle_model}` : ''}
      </div>
      <div className="text-xs text-slate-500 am">
        {r.material_label} · {fmtNum(r.quantity)} {r.unit} → {r.destination ?? '—'}
      </div>
      {r.dispatch_status === 'pending_verification' && (
        <div className="text-[11px] text-amber-700 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Waiting for admin approval
        </div>
      )}
      {r.exited_at && r.dispatch_status === 'exited' && (
        <div className="text-[11px] text-sky-700">Exited {fmtDateTime(r.exited_at)}</div>
      )}
      <div className="flex items-center gap-3 pt-1">
        {r.maps_link && (
          <a
            href={r.maps_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
          >
            <Navigation className="w-3.5 h-3.5" /> Navigate
          </a>
        )}
        {pass && (
          <button
            onClick={() => onPrint(pass)}
            className="text-xs font-semibold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
          >
            <Printer className="w-3.5 h-3.5" /> {pass.pass_number}
          </button>
        )}
      </div>
      {action}
    </div>
  );
}
