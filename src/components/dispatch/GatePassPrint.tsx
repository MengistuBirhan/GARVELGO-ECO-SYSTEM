import { Truck, MapPin, HardHat, ClipboardList, Navigation } from 'lucide-react';
import { fmtNum, fmtDateTime } from '@/lib/format';
import type { GatePass } from '@/lib/types';
import { PrintFooter } from '@/components/Footer';

const COMPANY = {
  name: 'GARVELGO SYSTEM',
  am: 'የግንባታ እቃ ሽያጭ እና መቆጣጠሪያ ሲስተም',
  phone: '+251 91 000 0000',
  address: 'Addis Ababa, Ethiopia',
};

export default function GatePassPrint({ pass, forPrint = false }: { pass: GatePass; forPrint?: boolean }) {
  return (
    <div className={forPrint ? 'p-8 font-sans text-slate-900' : 'rounded-xl border-2 border-dashed border-slate-300 p-6'}>
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
          <div className="text-xl font-bold tracking-tight text-amber-600">GATE PASS</div>
          <div className="am text-xs text-slate-500">የበር መውጫ ደረሰኝ</div>
          <div className="font-mono text-sm mt-1">{pass.pass_number}</div>
        </div>
      </div>

      {/* Authorization banner */}
      <div className="my-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-center">
        <div className="am text-sm font-semibold text-amber-800">ይህ ደረሰኝ መኪናው ከጣቢያችን እንዲወጣ ፍቃድ ይሰጣል።</div>
        <div className="text-[11px] text-amber-700">This pass authorizes the truck to exit the site.</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Detail icon={Truck} label="Truck Plate" am="የመኪና ሰሌዳ" value={pass.truck_plate} mono />
        <Detail icon={ClipboardList} label="Order Ref" am="ቁጥር" value={pass.order_ref || '—'} mono />
        <Detail label="Driver Name" am="የነጂ ስም" value={pass.driver_name} amharic />
        <Detail label="Driver Phone" am="የነጂ ስልክ" value={pass.driver_phone || '—'} mono />
        <Detail label="Vehicle Model" am="የመኪና ሞዴል" value={pass.vehicle_model || '—'} />
        <Detail icon={MapPin} label="Delivery Address" am="የማድረሻ አድራሻ" value={pass.customer_address || pass.destination} amharic />
        <Detail label="Material" am="እቃ" value={pass.material_label} amharic />
        <Detail label="Quantity" am="መጠን" value={`${fmtNum(pass.quantity)} ${pass.unit}`} />
      </div>

      {pass.maps_link && (
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-sky-600 font-semibold flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5" /> Navigation · <span className="am normal-case">መንገድ ማሳያ</span>
          </div>
          <a
            href={pass.maps_link}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1 text-sm font-semibold text-sky-700 underline break-all"
          >
            Open in Google Maps
          </a>
          <div className="text-[11px] font-mono text-slate-500 break-all mt-0.5">{pass.maps_link}</div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Dispatch Date / Time</div>
          <div className="text-slate-800">{fmtDateTime(pass.dispatched_at)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Authorized Signature</div>
          <div className="mt-6 w-40 border-b border-slate-300" />
        </div>
      </div>

      <div className="mt-6 text-center text-[11px] text-slate-400">
        Gate pass is valid only for the date issued. Retain copy for dispatch records.
      </div>
      <PrintFooter />
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  am,
  value,
  mono,
  amharic,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  am: string;
  value: string;
  mono?: boolean;
  amharic?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <div className="text-[11px] text-slate-400 am -mt-0.5 mb-1">{am}</div>
      <div className={`font-semibold text-slate-900 ${mono ? 'font-mono' : ''} ${amharic ? 'am' : ''}`}>{value}</div>
    </div>
  );
}
