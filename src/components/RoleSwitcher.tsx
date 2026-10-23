import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Shield, Check } from 'lucide-react';
import { useRole, ROLES, ROLE_ORDER, type RoleId } from '@/lib/rbac';

const ROLE_DOT: Record<RoleId, string> = {
  admin: 'bg-amber-500',
  cashier: 'bg-emerald-500',
  gatekeeper: 'bg-sky-500',
};

export default function RoleSwitcher() {
  const { role, setRole, info } = useRole();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative no-print">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 lg:px-3 py-1.5 lg:py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        aria-label="Switch role"
      >
        <span className={`w-2.5 h-2.5 rounded-full ${ROLE_DOT[role]} shrink-0`} />
        <span className="hidden sm:flex flex-col leading-tight text-left">
          <span className="text-[13px] font-semibold">{info.label}</span>
          <span className="am text-[10px] text-slate-400 dark:text-slate-500">{info.am}</span>
        </span>
        <span className="sm:hidden text-[13px] font-semibold">{info.label}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/10 z-50 overflow-hidden animate-fade-in-up">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">
              <Shield className="w-3.5 h-3.5" />
              Switch Role · <span className="am">ሁኔታ ቀይር</span>
            </div>
          </div>
          <div className="p-1.5">
            {ROLE_ORDER.map((id) => {
              const r = ROLES[id];
              const active = id === role;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setRole(id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    active ? 'bg-amber-50 dark:bg-amber-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`mt-1 w-2.5 h-2.5 rounded-full ${ROLE_DOT[id]} shrink-0`} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.label}</span>
                      <span className="am text-xs text-slate-400 dark:text-slate-500">{r.am}</span>
                    </span>
                  </span>
                  {active && <Check className="w-4 h-4 text-amber-500 mt-1 shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 text-center">
            Session role · <span className="am">የክፍለ ጊዜ ሁኔታ</span>
          </div>
        </div>
      )}
    </div>
  );
}
