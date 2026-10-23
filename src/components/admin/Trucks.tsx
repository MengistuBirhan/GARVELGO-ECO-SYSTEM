import { useCallback, useEffect, useState } from 'react';
import { Truck, Plus, Pencil, Trash2, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { saveVehicle, deleteVehicle } from '@/lib/db';
import { useRealtimeRefresh } from '@/lib/realtime';
import { useAdminAuth } from '@/lib/adminAuth';
import { VEHICLE_STATUS_LABELS, type Vehicle } from '@/lib/types';
import { Card, Button, Field, inputClass, Badge, Spinner, EmptyState } from '@/components/ui';

const EMPTY = { id: null as string | null, plate_number: '', driver_name: '', driver_phone: '', vehicle_model: '' };

export default function Trucks() {
  const { user } = useAdminAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('vehicles').select('*').order('plate_number');
    setVehicles((data ?? []) as Vehicle[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(['vehicles'], load);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (!form.plate_number.trim() || !form.driver_name.trim() || !form.driver_phone.trim())
      return setError('Plate number, driver name and driver phone are required.');
    setBusy(true);
    try {
      await saveVehicle(user.id, form);
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save truck.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(v: Vehicle) {
    if (!user) return;
    if (!window.confirm(`Delete truck ${v.plate_number}?`)) return;
    setError(null);
    try {
      await deleteVehicle(user.id, v.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete truck.');
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
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-6 self-start">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">
                {form.id ? 'Edit Truck' : 'Register Truck'}
              </h3>
              <p className="am text-xs text-slate-500">{form.id ? 'መኪና አስተካክል' : 'መኪና መዝግብ'}</p>
            </div>
            <Plus className="w-5 h-5 text-slate-300" />
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Plate Number" amLabel="የመኪና ሰሌዳ">
              <input
                value={form.plate_number}
                onChange={(e) => setForm({ ...form, plate_number: e.target.value })}
                placeholder="e.g. AA 12345"
                className={`${inputClass} uppercase font-mono`}
              />
            </Field>
            <Field label="Driver Name" amLabel="የነጂ ስም">
              <input
                value={form.driver_name}
                onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
                className={`${inputClass} am`}
              />
            </Field>
            <Field label="Driver Phone" amLabel="የነጂ ስልክ">
              <input
                value={form.driver_phone}
                onChange={(e) => setForm({ ...form, driver_phone: e.target.value })}
                placeholder="09..."
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="Vehicle Model" amLabel="የመኪና ሞዴል">
              <input
                value={form.vehicle_model}
                onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                placeholder="e.g. Sinotruk Howo"
                className={inputClass}
              />
            </Field>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>}
            <div className="flex gap-3">
              <Button type="submit" loading={busy} className="flex-1">
                {form.id ? 'Save changes' : 'Register truck (Available)'}
              </Button>
              {form.id && (
                <Button type="button" variant="ghost" onClick={() => { setForm(EMPTY); setError(null); }}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Card>
        <RecoveryKeyCard />
      </div>

      <Card className="lg:col-span-3 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Registered Trucks</h3>
            <p className="am text-xs text-slate-500">የተመዘገቡ መኪናዎች</p>
          </div>
          <Badge tone="blue">{vehicles.length}</Badge>
        </div>
        {vehicles.length === 0 ? (
          <EmptyState icon={Truck} title="No trucks registered" subtitle="Cashiers can only choose from trucks registered here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2 pr-3">Plate</th>
                  <th className="py-2 pr-3">Driver</th>
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {vehicles.map((v) => {
                  const st = VEHICLE_STATUS_LABELS[v.status];
                  return (
                    <tr key={v.id}>
                      <td className="py-2.5 pr-3 font-mono font-semibold">{v.plate_number}</td>
                      <td className="py-2.5 pr-3">
                        <div className="am">{v.driver_name}</div>
                        <div className="text-xs text-slate-400 font-mono">{v.driver_phone}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{v.vehicle_model || '—'}</td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={st.tone}>{st.en}</Badge>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => { setForm({ id: v.id, plate_number: v.plate_number, driver_name: v.driver_name, driver_phone: v.driver_phone, vehicle_model: v.vehicle_model }); setError(null); }}
                          className="p-1.5 text-slate-400 hover:text-slate-700"
                          aria-label="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => remove(v)}
                          disabled={v.status !== 'available'}
                          className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Delete"
                          title={v.status !== 'available' ? 'Only Available trucks can be deleted' : 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
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
    </div>
  );
}

/** Lets the admin replace the default password-recovery key. */
function RecoveryKeyCard() {
  const { user } = useAdminAuth();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setMsg(null);
    setBusy(true);
    const { error } = await supabase.rpc('staff_set_recovery_key', { p_user_id: user.id, p_new_key: key });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setKey('');
    setMsg({ ok: true, text: 'Recovery key updated. Store it somewhere safe.' });
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-slate-900 dark:text-slate-100">Admin recovery key</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Used by “Forgot password?” on the admin login. Replace the default key now.
      </p>
      <form onSubmit={save} className="space-y-3">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="New recovery key (min 10 characters)"
          className={`${inputClass} font-mono`}
          autoComplete="off"
        />
        {msg && (
          <div className={`text-xs rounded-lg px-3 py-2 ${msg.ok ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>{msg.text}</div>
        )}
        <Button type="submit" variant="secondary" loading={busy} className="w-full">Update recovery key</Button>
      </form>
    </Card>
  );
}
