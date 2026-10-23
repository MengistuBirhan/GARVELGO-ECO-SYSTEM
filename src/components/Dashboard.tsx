import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Package,
  CreditCard,
  Layers,
  ArrowRight,
  AlertTriangle,
  Banknote,
  Truck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fmtETB, fmtNum, todayBounds } from '@/lib/format';
import type { Sale, Material } from '@/lib/types';
import { Card, Spinner, Badge } from '@/components/ui';

type Props = { onNavigate: (tab: 'dashboard' | 'pos' | 'dispatch' | 'ledger' | 'inventory') => void };

export default function Dashboard({ onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [creditTotal, setCreditTotal] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { from, to } = todayBounds();
      const [salesRes, matRes, credRes] = await Promise.all([
        supabase.from('sales').select('*').neq('dispatch_status', 'rejected').gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }),
        supabase.from('materials').select('*').order('name_am'),
        supabase.from('sales').select('balance_due').neq('dispatch_status', 'rejected'),
      ]);
      setSales(salesRes.data ?? []);
      setMaterials(matRes.data ?? []);
      setCreditTotal((credRes.data ?? []).reduce((s, r) => s + Number(r.balance_due), 0));
      setLoading(false);
    })();
  }, []);

  const metrics = useMemo(() => {
    const totalSales = sales.reduce((s, x) => s + Number(x.total), 0);
    const totalVolume = sales.reduce((s, x) => s + Number(x.quantity), 0);
    const invoices = sales.length;
    const avg = invoices ? totalSales / invoices : 0;
    return { totalSales, totalVolume, invoices, avg };
  }, [sales]);

  const byMaterial = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>();
    sales.forEach((s) => {
      const cur = map.get(s.material_label) ?? { qty: 0, total: 0 };
      cur.qty += Number(s.quantity);
      cur.total += Number(s.total);
      map.set(s.material_label, cur);
    });
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [sales]);

  const lowStock = materials.filter((m) => Number(m.stock_quantity) <= Number(m.low_stock_threshold));

  const maxMat = byMaterial[0]?.total ?? 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-7 h-7" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={Banknote}
          label="Total Sales Today"
          am="የዛሬ ጠቅላላ ሽያጭ"
          value={`${fmtETB(metrics.totalSales)} ETB`}
          accent="from-amber-400 to-orange-500"
          sub={`${metrics.invoices} invoice${metrics.invoices === 1 ? '' : 's'}`}
        />
        <MetricCard
          icon={Layers}
          label="Total Volume Sold"
          am="የተሸጠ መጠን"
          value={`${fmtNum(metrics.totalVolume)} m³`}
          accent="from-sky-400 to-blue-500"
          sub={`avg ${fmtNum(metrics.avg)} ETB / invoice`}
        />
        <MetricCard
          icon={CreditCard}
          label="Active Credit Balance"
          am="ያልተከፈለ ብድር"
          value={`${fmtETB(creditTotal)} ETB`}
          accent="from-rose-400 to-red-500"
          sub="across all customers"
        />
        <MetricCard
          icon={Package}
          label="Materials in Catalog"
          am="የእቃ ዓይነቶች"
          value={`${materials.length}`}
          accent="from-emerald-400 to-green-500"
          sub={`${lowStock.length} low-stock alert${lowStock.length === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales breakdown */}
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Sales Breakdown by Material</h3>
              <p className="am text-xs text-slate-500 dark:text-slate-400">በእቃ ዓይነት የዛሬ ሽያጭ</p>
            </div>
            <TrendingUp className="w-5 h-5 text-slate-300 dark:text-slate-600" />
          </div>
          {byMaterial.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-10 text-center">No sales recorded today yet.</p>
          ) : (
            <div className="space-y-3.5">
              {byMaterial.map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300 am">{m.label}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-xs tabular-nums">
                      {fmtNum(m.qty)} m³ · <span className="font-semibold text-slate-700 dark:text-slate-300">{fmtETB(m.total)}</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700"
                      style={{ width: `${Math.max(3, (m.total / maxMat) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Low stock */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Low Stock Alerts</h3>
              <p className="am text-xs text-slate-500 dark:text-slate-400">ዝቅተኛ ክምችት ማስታወቂያ</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400" />
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">All materials well stocked.</p>
          ) : (
            <div className="space-y-2.5">
              {lowStock.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                  <div>
                    <div className="am text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {m.name_am}
                      {m.subtype ? ` · ${m.subtype}` : ''}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{m.name_en}</div>
                  </div>
                  <Badge tone="amber">{fmtNum(Number(m.stock_quantity))} {m.unit}</Badge>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => onNavigate('inventory')}
            className="mt-4 w-full text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-center gap-1 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Manage inventory <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </Card>
      </div>

      {/* Recent dispatches / quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Today's Sales</h3>
            <button onClick={() => onNavigate('pos')} className="text-xs font-semibold text-amber-600 dark:text-amber-500 hover:text-amber-700 flex items-center gap-1">
              New sale <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {sales.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-8 text-center">No invoices yet today.</p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-2 py-2 font-semibold">Invoice</th>
                    <th className="px-2 py-2 font-semibold">Customer</th>
                    <th className="px-2 py-2 font-semibold am">እቃ</th>
                    <th className="px-2 py-2 font-semibold text-right">Total</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {sales.slice(0, 8).map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/60">
                      <td className="px-2 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">{s.invoice_number}</td>
                      <td className="px-2 py-2.5 am text-slate-700 dark:text-slate-300 max-w-[140px] truncate">{s.customer_name}</td>
                      <td className="px-2 py-2.5 am text-slate-600 dark:text-slate-400 max-w-[140px] truncate">{s.material_label}</td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{fmtETB(s.total)}</td>
                      <td className="px-2 py-2.5">
                        <Badge tone={s.status === 'paid' ? 'green' : s.status === 'partial' ? 'amber' : 'red'}>
                          {s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-1">Quick Actions</h3>
          <p className="am text-xs text-slate-500 dark:text-slate-400 mb-4">ፈጣን እርምጃዎች</p>
          <div className="space-y-2.5">
            <QuickAction icon={Banknote} label="Record a Sale" am="ሽያጭ መዝግብ" onClick={() => onNavigate('pos')} />
            <QuickAction icon={Truck} label="Issue Gate Pass" am="የበር መውጫ ይስጡ" onClick={() => onNavigate('dispatch')} />
            <QuickAction icon={CreditCard} label="Record Repayment" am="ብድር መክፈል" onClick={() => onNavigate('ledger')} />
            <QuickAction icon={Package} label="Manage Inventory" am="ክምችት ያስተዱ" onClick={() => onNavigate('inventory')} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  am,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  am: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <Card className="p-5 relative overflow-hidden">
      <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br ${accent} opacity-10`} />
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center mb-4 shadow-sm`}>
        <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
      </div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">{label}</div>
      <div className="am text-[11px] text-slate-400 dark:text-slate-500 -mt-0.5">{am}</div>
      <div className="text-xl lg:text-2xl font-bold tracking-tight mt-2 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{sub}</div>}
    </Card>
  );
}

function QuickAction({
  icon: Icon,
  label,
  am,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  am: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-500/10 transition-all text-left group"
    >
      <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-amber-100 dark:group-hover:bg-amber-500/20 flex items-center justify-center transition-colors">
        <Icon className="w-4 h-4 text-slate-600 dark:text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</div>
        <div className="am text-[11px] text-slate-400 dark:text-slate-500">{am}</div>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-amber-500 dark:group-hover:text-amber-400" />
    </button>
  );
}
