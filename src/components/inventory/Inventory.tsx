import { useEffect, useMemo, useState } from 'react';
import { Boxes, Plus, Search, AlertTriangle, Save, Pencil, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fmtETB, fmtNum } from '@/lib/format';
import { UNITS, UNIT_LABELS, type Material, type Unit } from '@/lib/types';
import { Card, Button, Field, inputClass, Badge, Spinner, EmptyState } from '@/components/ui';

export default function Inventory() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form
  const [nameAm, setNameAm] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [subtype, setSubtype] = useState('');
  const [unit, setUnit] = useState<Unit>('m³');
  const [unitPrice, setUnitPrice] = useState('');
  const [stock, setStock] = useState('');
  const [threshold, setThreshold] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('materials').select('*').order('name_am');
    setMaterials(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) =>
      `${m.name_am} ${m.name_en} ${m.subtype ?? ''}`.toLowerCase().includes(q)
    );
  }, [materials, search]);

  const lowCount = materials.filter((m) => Number(m.stock_quantity) <= Number(m.low_stock_threshold)).length;
  const totalValue = materials.reduce((s, m) => s + Number(m.stock_quantity) * Number(m.unit_price), 0);

  function resetForm() {
    setNameAm('');
    setNameEn('');
    setSubtype('');
    setUnit('m³');
    setUnitPrice('');
    setStock('');
    setThreshold('');
    setError(null);
  }

  function startEdit(m: Material) {
    setEditing(m);
    setShowAdd(true);
    setNameAm(m.name_am);
    setNameEn(m.name_en);
    setSubtype(m.subtype ?? '');
    setUnit(m.unit as Unit);
    setUnitPrice(String(m.unit_price));
    setStock(String(m.stock_quantity));
    setThreshold(String(m.low_stock_threshold));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nameAm.trim() || !nameEn.trim()) return setError('Both Amharic and English names are required.');
    setSaving(true);
    try {
      const payload = {
        name_am: nameAm.trim(),
        name_en: nameEn.trim(),
        subtype: subtype.trim() || null,
        unit,
        unit_price: Number(unitPrice || 0),
        stock_quantity: Number(stock || 0),
        low_stock_threshold: Number(threshold || 0),
      };
      if (editing) {
        const { error: err } = await supabase.from('materials').update(payload).eq('id', editing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('materials').insert(payload);
        if (err) throw err;
      }
      resetForm();
      setShowAdd(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save material.');
    } finally {
      setSaving(false);
    }
  }

  async function quickAdjust(m: Material, delta: number) {
    const newStock = Math.max(0, Number(m.stock_quantity) + delta);
    await supabase.from('materials').update({ stock_quantity: newStock }).eq('id', m.id);
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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={Boxes} label="Materials" am="እቃ ዓይነቶች" value={`${materials.length}`} accent="from-sky-400 to-blue-500" />
        <SummaryCard icon={AlertTriangle} label="Low Stock Alerts" am="ዝቅተኛ ክምችት" value={`${lowCount}`} accent="from-amber-400 to-orange-500" />
        <SummaryCard icon={Boxes} label="Inventory Value" am="የክምችት ዋጋ" value={`${fmtETB(totalValue)} ETB`} accent="from-emerald-400 to-green-500" />
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="font-bold text-slate-900">Inventory Control</h3>
            <p className="am text-xs text-slate-500">ቆጠራ እና የእቃ መቆጣጠሪያ</p>
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search material..."
                className={`${inputClass} pl-9 sm:w-56`}
              />
            </div>
            <Button
              onClick={() => {
                resetForm();
                setEditing(null);
                setShowAdd(true);
              }}
            >
              <Plus className="w-4 h-4" /> Add Material
            </Button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Boxes} title="No materials found" subtitle="Add materials to track stock and pricing." />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-3 py-2 font-semibold">Material</th>
                  <th className="px-3 py-2 font-semibold">Unit</th>
                  <th className="px-3 py-2 font-semibold text-right">Unit Price</th>
                  <th className="px-3 py-2 font-semibold text-right">Stock</th>
                  <th className="px-3 py-2 font-semibold text-right">Threshold</th>
                  <th className="px-3 py-2 font-semibold text-right">Stock Value</th>
                  <th className="px-3 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((m) => {
                  const low = Number(m.stock_quantity) <= Number(m.low_stock_threshold);
                  const value = Number(m.stock_quantity) * Number(m.unit_price);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-3">
                        <div className="am font-semibold text-slate-800">
                          {m.name_am}
                          {m.subtype ? <span className="text-slate-500 font-normal"> · {m.subtype}</span> : null}
                        </div>
                        <div className="text-[11px] text-slate-400">{m.name_en}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{m.unit}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">{fmtETB(m.unit_price)}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => quickAdjust(m, -1)} className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">−</button>
                          <span className={`tabular-nums font-semibold w-16 text-center ${low ? 'text-rose-600' : 'text-slate-800'}`}>{fmtNum(Number(m.stock_quantity))}</span>
                          <button onClick={() => quickAdjust(m, 1)} className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">+</button>
                        </div>
                        {low && <div className="mt-0.5"><Badge tone="red">low</Badge></div>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500">{fmtNum(Number(m.low_stock_threshold))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtETB(value)}</td>
                      <td className="px-3 py-3 text-right">
                        <button onClick={() => startEdit(m)} className="text-xs font-semibold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1">
                          <Pencil className="w-3.5 h-3.5" /> Edit
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

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">{editing ? 'Edit Material' : 'Add Material'}</h3>
                <p className="am text-xs text-slate-500">{editing ? 'እቃ አስተካክል' : 'አዲስ እቃ'}</p>
              </div>
              <button onClick={() => { setShowAdd(false); setEditing(null); }} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Amharic Name" amLabel="በአማርኛ">
                    <input value={nameAm} onChange={(e) => setNameAm(e.target.value)} className={`${inputClass} am`} placeholder="አሸዋ" />
                  </Field>
                  <Field label="English Name" amLabel="በእንግሊዝኛ">
                    <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputClass} placeholder="Sand" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Subtype / Grade" amLabel="ንዑስ ዓይነት">
                    <input value={subtype} onChange={(e) => setSubtype(e.target.value)} className={inputClass} placeholder="e.g. 00, #1, Cobble" />
                  </Field>
                  <Field label="Unit" amLabel="መለኪያ">
                    <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className={inputClass}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Unit Price (ETB)" amLabel="የአሃድ ዋጋ">
                  <input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={inputClass} placeholder="0.00" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Stock Quantity" amLabel="ክምችት">
                    <input type="number" min="0" step="0.01" value={stock} onChange={(e) => setStock(e.target.value)} className={inputClass} placeholder="0" />
                  </Field>
                  <Field label="Low-Stock Threshold" amLabel="ዝቅተኛ ደረጃ">
                    <input type="number" min="0" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} className={inputClass} placeholder="0" />
                  </Field>
                </div>
                {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>}
                <div className="flex gap-3">
                  <Button type="submit" loading={saving} className="flex-1">
                    <Save className="w-4 h-4" /> {editing ? 'Save Changes' : 'Add Material'}
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => { setShowAdd(false); setEditing(null); }}>Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
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
