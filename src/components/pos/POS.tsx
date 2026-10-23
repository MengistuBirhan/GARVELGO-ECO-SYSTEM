import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Plus, Search, CheckCircle2, X, Truck, MapPin, FlaskConical } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { submitSale } from '@/lib/db';
import { useRealtimeRefresh } from '@/lib/realtime';
import { normalizeMapsLink, MAPS_LINK_ERROR, isValidCbeTxnId, CBE_TXN_ID_ERROR, CBE_TXN_ID_REQUIRED } from '@/lib/location';
import { fmtETB, fmtNum, fmtDateTime } from '@/lib/format';
import {
  merchantFor,
  PAYMENT_METHODS_WITH_REF,
  PAYMENT_METHOD_LABELS,
  CBE_VALIDATION_ERROR,
  isValidCbeAccount,
  UNIT_LABELS,
  type Material,
  type PaymentMethod,
  type Sale,
  type Unit,
  type Vehicle,
} from '@/lib/types';
import { Card, Button, Field, inputClass, Badge, Spinner } from '@/components/ui';
import { useAdminAuth } from '@/lib/adminAuth';
import InvoicePrint from './InvoicePrint';

export default function POS() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // form state
  const [customerName, setCustomerName] = useState('');
  const [selectedMat, setSelectedMat] = useState<Material | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Unit>('m³');
  const [unitPrice, setUnitPrice] = useState('');
  const [transportFee, setTransportFee] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('telebirr');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [city, setCity] = useState('');
  const [kebele, setKebele] = useState('');
  const [area, setArea] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [testMode, setTestMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Only trucks with status "Available" can be picked (live-updated).
  async function loadVehicles() {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .eq('status', 'available')
      .order('plate_number');
    const list = (data ?? []) as Vehicle[];
    setVehicles(list);
    setVehicleId((cur) => (cur && !list.some((v) => v.id === cur) ? '' : cur));
  }
  useEffect(() => {
    loadVehicles();
  }, []);
  useRealtimeRefresh(['vehicles'], loadVehicles);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('materials').select('*').order('name_am');
      setMaterials(data ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) =>
      `${m.name_am} ${m.name_en} ${m.subtype ?? ''}`.toLowerCase().includes(q)
    );
  }, [materials, search]);

  const subtotal = Number(quantity || 0) * Number(unitPrice || 0);
  const total = subtotal + Number(transportFee || 0);
  const paid = Number(amountPaid || 0);
  const balance = Math.max(0, total - paid);

  const needsRef = PAYMENT_METHODS_WITH_REF.includes(method);
  const merchant = merchantFor(method);
  const { user } = useAdminAuth();
  const creditAuthorized = !!user?.creditAuthorized;

  const availableMethods = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])
    .filter((m) => m !== 'credit' || creditAuthorized);

  // If the current method is credit but the user lost authorization, reset it.
  useEffect(() => {
    if (method === 'credit' && !creditAuthorized) {
      setMethod('telebirr');
    }
  }, [creditAuthorized, method]);

  function selectMaterial(m: Material) {
    setSelectedMat(m);
    setUnit(m.unit as Unit);
    setUnitPrice(String(m.unit_price));
    setQuantity('');
    setTransportFee('');
    setAmountPaid('');
    setTransactionRef('');
    setPaymentAccount('');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedMat) return setError('Please select a material.');
    const qty = Number(quantity);
    if (!qty || qty <= 0) return setError('Enter a valid quantity.');
    if (!customerName.trim()) return setError('Customer name is required.');
    if (total <= 0) return setError('Total must be greater than zero.');
    if (!vehicleId) return setError('Select an available truck from the list. / ዝግጁ መኪና ይምረጡ።');
    if (!city.trim()) return setError('Customer city is required. / ከተማ ያስገቡ።');
    if (!kebele.trim()) return setError('Kebele is required. / ቀበሌ ያስገቡ።');
    if (!area.trim()) return setError('Specific area / sefer is required. / ሰፈር ያስገቡ።');
    const maps = normalizeMapsLink(mapsLink);
    if (!maps) return setError(MAPS_LINK_ERROR);
    if (method === 'credit' && !creditAuthorized)
      return setError('Credit requires admin permission. / ብድር የአስተዳዳሪ ፈቃድ ያስፈልገዋል።');
    if (!testMode) {
      if (method === 'cbe_bank') {
        if (!isValidCbeAccount(paymentAccount)) return setError(CBE_VALIDATION_ERROR);
        if (!transactionRef.trim()) return setError(CBE_TXN_ID_REQUIRED);
        if (!isValidCbeTxnId(transactionRef)) return setError(CBE_TXN_ID_ERROR);
      }
      if (needsRef && !transactionRef.trim())
        return setError('A transaction reference number is required for this payment method.');
    } else {
      if (needsRef && !transactionRef.trim())
        return setError('A transaction reference is required even in test mode. / የግብይት ማረጋገጫ ቁጥር ያስፈልጋል።');
    }

    setSubmitting(true);
    try {
      const sale = await submitSale({
        staff_id: user?.id ?? null,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim() || null,
        material_id: selectedMat.id,
        vehicle_id: vehicleId,
        customer_city: city.trim(),
        customer_kebele: kebele.trim(),
        customer_area: area.trim(),
        maps_link: maps,
        paid_to_account: method === 'cbe_bank' ? paymentAccount.trim() : null,
        quantity: qty,
        unit,
        unit_price: Number(unitPrice || 0),
        transport_fee: Number(transportFee || 0),
        payment_method: method,
        amount_paid: method === 'credit' ? paid : total,
        transaction_ref: needsRef ? transactionRef.trim() : null,
        test_mode: testMode,
      });
      setLastSale(sale);
      // refresh stock
      const { data: mats } = await supabase.from('materials').select('*').order('name_am');
      setMaterials(mats ?? []);
      setSelectedMat(null);
      setCustomerName('');
      setQuantity('');
      setUnitPrice('');
      setTransportFee('');
      setAmountPaid('');
      setTransactionRef('');
      setPaymentAccount('');
      setCustomerEmail('');
      setCity('');
      setKebele('');
      setArea('');
      setMapsLink('');
      setVehicleId('');
      await loadVehicles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record sale.');
    } finally {
      setSubmitting(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="w-7 h-7" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Material picker */}
      <Card className="lg:col-span-2 p-5 self-start">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900">Materials</h3>
            <p className="am text-xs text-slate-500">እቃ ይምረጡ</p>
          </div>
          <Badge tone="slate">{materials.length}</Badge>
        </div>
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search material..."
            className={`${inputClass} pl-9`}
          />
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map((m) => {
            const low = Number(m.stock_quantity) <= Number(m.low_stock_threshold);
            const active = selectedMat?.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => selectMaterial(m)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                  active
                    ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="am font-semibold text-slate-900 truncate">
                      {m.name_am}
                      {m.subtype ? <span className="text-slate-500 font-normal"> · {m.subtype}</span> : null}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{m.name_en} · {m.unit}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums">{fmtETB(m.unit_price)}</div>
                    <div className={`text-[11px] ${low ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                      {fmtNum(Number(m.stock_quantity))} {m.unit}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No materials match.</p>
          )}
        </div>
      </Card>

      {/* Sale form */}
      <Card className="lg:col-span-3 p-6 self-start">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-slate-900">New Sale / Invoice</h3>
            <p className="am text-xs text-slate-500">አዲስ ሽያጭ መዝግብ</p>
          </div>
          <Plus className="w-5 h-5 text-slate-300" />
        </div>

        {/* Test mode toggle */}
        <div className={`rounded-xl border p-3.5 mb-5 flex items-start gap-3 transition-colors ${testMode ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
          <FlaskConical className={`w-5 h-5 mt-0.5 shrink-0 ${testMode ? 'text-amber-500' : 'text-slate-400'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">Test Mode</span>
              <button
                type="button"
                role="switch"
                aria-checked={testMode}
                onClick={() => setTestMode((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${testMode ? 'bg-amber-500' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${testMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {testMode
                ? 'ON — Any dummy transaction reference (e.g. FT123456789) will be accepted. Real bank account and reference format checks are skipped. Use only for testing.'
                : 'OFF — Real payment verification is active. Turn on to submit test orders with dummy references.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Customer Name" amLabel="ደንበኛ ስም">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. አበበ ግንባታ / Walk-in"
                className={`${inputClass} am`}
              />
            </Field>
            <Field label="Selected Material" amLabel="የተመረጠ እቃ">
              <input
                value={selectedMat ? `${selectedMat.name_am}${selectedMat.subtype ? ` · ${selectedMat.subtype}` : ''}` : ''}
                readOnly
                placeholder="Pick from left"
                className={`${inputClass} am bg-slate-50`}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Customer Email (optional)" amLabel="ኢሜይል" hint="Receipt & gate pass are emailed here after approval">
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <MapPin className="w-4 h-4 text-amber-500" /> Delivery Address <span className="am text-xs font-normal text-slate-400">የማድረሻ አድራሻ</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="City" amLabel="ከተማ">
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Dessie" className={`${inputClass} am`} />
              </Field>
              <Field label="Kebele" amLabel="ቀበሌ">
                <input value={kebele} onChange={(e) => setKebele(e.target.value)} placeholder="e.g. 05" className={`${inputClass} am`} />
              </Field>
              <Field label="Specific Area / Sefer" amLabel="ሰፈር">
                <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Piassa, near the church" className={`${inputClass} am`} />
              </Field>
            </div>
            <Field
              label="Google Maps Link / GPS Pin (required)"
              amLabel="የጉግል ማፕ ሊንክ"
              hint="Open Google Maps → Share → Copy link, or paste coordinates like 9.0320, 38.7469"
            >
              <input
                value={mapsLink}
                onChange={(e) => setMapsLink(e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
                className={`${inputClass} font-mono`}
                required
              />
            </Field>
            {mapsLink.trim() && (
              normalizeMapsLink(mapsLink) ? (
                <a href={normalizeMapsLink(mapsLink)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700">
                  <MapPin className="w-3.5 h-3.5" /> Test link in Google Maps
                </a>
              ) : (
                <div className="text-xs text-red-600">Not a valid Google Maps link or GPS pin.</div>
              )
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <Field
              label="Truck (pre-registered, Available only)"
              amLabel="መኪና (ዝግጁ ብቻ)"
              hint={vehicles.length === 0 ? 'No available trucks. Ask the admin to register one, or wait for a truck to return.' : undefined}
            >
              <div className="relative">
                <Truck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className={`${inputClass} pl-9`}
                >
                  <option value="">{vehicles.length === 0 ? 'No available trucks' : 'Select truck...'}</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate_number} — {v.driver_name}{v.vehicle_model ? ` (${v.vehicle_model})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            {(() => {
              const v = vehicles.find((x) => x.id === vehicleId);
              return v ? (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Driver: <span className="am font-semibold">{v.driver_name}</span> · {v.driver_phone}
                </div>
              ) : null;
            })()}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Quantity" amLabel="መጠን">
              <input
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </Field>
            <Field label="Unit" amLabel="መለኪያ">
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className={inputClass}>
                {(Object.keys(UNIT_LABELS) as Unit[]).map((u) => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
            </Field>
            <Field label="Unit Price (ETB)" amLabel="የአሃድ ዋጋ">
              <input
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </Field>
            <Field label="Transport Fee (ETB)" amLabel="የማጓጓዣ ዋጋ">
              <input
                type="number"
                min="0"
                step="0.01"
                value={transportFee}
                onChange={(e) => setTransportFee(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Payment Method" amLabel="የክፍያ ዘዴ">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className={inputClass}
              >
                {availableMethods.map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </Field>
            {method === 'credit' && (
              <Field label="Amount Paid Now (ETB)" amLabel="አሁን የተከፈለ" hint="Leave 0 for full credit">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </Field>
            )}
          </div>

          {needsRef && merchant && (
            <div className={`rounded-2xl border p-4 space-y-4 ${testMode ? 'border-amber-200 bg-amber-50/60' : 'border-sky-200 bg-sky-50/60'}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-white border border-sky-100 p-3.5">
                  <div className="text-[11px] uppercase tracking-wide text-sky-500 font-semibold">
                    {merchant.label}
                  </div>
                  <div className="am text-[11px] text-sky-400 -mt-0.5">{merchant.amLabel}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-xs">Account Name</span>
                      <span className="am font-semibold text-slate-800">{merchant.accountName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-xs">{method === 'telebirr' ? 'Phone Number' : 'Account Number'}</span>
                      <span className="font-mono font-semibold text-slate-800">{merchant.accountNumber}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="w-full space-y-3">
                    {method === 'cbe_bank' && (
                      <Field
                        label="Payment Sent To (Account Number)"
                        amLabel="የተከፈለበት ሂሳብ ቁጥር"
                        hint="Required — the account number shown on the customer's CBE receipt"
                      >
                        <input
                          value={paymentAccount}
                          onChange={(e) => setPaymentAccount(e.target.value)}
                          placeholder="1000474209637"
                          className={`${inputClass} font-mono`}
                          required
                        />
                      </Field>
                    )}
                    <Field
                      label={merchant.refLabel}
                      amLabel={merchant.refAmLabel}
                      hint={
                        testMode
                          ? 'Test mode — enter any dummy reference (e.g. FT123456789)'
                          : method === 'cbe_bank'
                            ? 'Required — CBE Transaction ID from the receipt (starts with FT)'
                            : 'Required — enter the confirmation number from the transfer'
                      }
                    >
                      <input
                        value={transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                        placeholder={testMode ? 'e.g. FT123456789 (any dummy ref)' : method === 'cbe_bank' ? 'e.g. FT24123ABCDE' : 'e.g. CGH7ABC123'}
                        className={`${inputClass} font-mono ${testMode ? 'border-amber-300' : ''}`}
                        required
                      />
                    </Field>
                  </div>
                </div>
              </div>
              <p className="am text-[11px] text-sky-700">
                እባክዎ ክፍያውን ወደላይ ባለው ሂሳብ ካደረጉ በኋላ የማረጋገጫ ቁጥሩን ይመልሱ።
              </p>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-2xl bg-slate-900 text-slate-100 p-5">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Subtotal</div>
                <div className="text-lg font-bold tabular-nums">{fmtETB(subtotal)}</div>
              </div>
              <div className="border-x border-slate-700">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Transport</div>
                <div className="text-lg font-bold tabular-nums">{fmtETB(Number(transportFee || 0))}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-amber-400">Total</div>
                <div className="text-lg font-bold tabular-nums text-amber-400">{fmtETB(total)}</div>
              </div>
            </div>
            {method === 'credit' && (
              <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between text-sm">
                <span className="text-slate-300">Balance Due (Credit)</span>
                <span className="font-bold text-rose-300 tabular-nums">{fmtETB(balance)} ETB</span>
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
          )}

          <div className="flex gap-3">
            <Button type="submit" loading={submitting} className="flex-1">
              <CheckCircle2 className="w-4 h-4" /> {testMode ? 'Submit Test Order' : 'Submit for Admin Verification'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Invoice modal */}
      {lastSale && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <div>
                  <h3 className="font-bold text-slate-900">Submitted — Pending Admin Verification</h3>
                  <p className="am text-xs text-slate-500">ለአስተዳዳሪ ማረጋገጫ ተልኳል</p>
                </div>
              </div>
              <button onClick={() => setLastSale(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <InvoicePrint sale={lastSale} />
              <div className="flex gap-3 mt-5">
                <Button onClick={handlePrint} className="flex-1">
                  <Printer className="w-4 h-4" /> Print Invoice
                </Button>
                <Button variant="ghost" onClick={() => setLastSale(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print area (hidden until print) */}
      {lastSale && (
        <div id="print-area" className="hidden">
          <InvoicePrint sale={lastSale} forPrint />
        </div>
      )}
    </div>
  );
}
