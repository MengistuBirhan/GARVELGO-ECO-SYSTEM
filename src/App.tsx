import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  BookUser,
  Boxes,
  HardHat,
  Menu,
  X,
  Shield,
  ClipboardCheck,
  Container,
} from 'lucide-react';
import Dashboard from '@/components/Dashboard';
import POS from '@/components/pos/POS';
import Dispatch from '@/components/dispatch/Dispatch';
import Ledger from '@/components/ledger/Ledger';
import Inventory from '@/components/inventory/Inventory';
import Approvals from '@/components/admin/Approvals';
import Trucks from '@/components/admin/Trucks';
import NotificationBell, { NotificationToasts } from '@/components/NotificationBell';
import { AppFooter } from '@/components/Footer';
import RoleSwitcher from '@/components/RoleSwitcher';
import AccessDenied from '@/components/AccessDenied';
import AdminLogin, { AdminSessionBadge } from '@/components/AdminLogin';
import { ThemeToggle } from '@/lib/theme';
import { useRole, canAccess, ROLES, ROLE_ORDER, requiresAdminAuth, type TabId } from '@/lib/rbac';
import { useAdminAuth } from '@/lib/adminAuth';
import { fmtEthDate } from '@/lib/ethiopianDate';

const NAV: { id: TabId; label: string; am: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', am: 'ዳሽቦርድ', icon: LayoutDashboard },
  { id: 'pos', label: 'POS & Invoice', am: 'የገዢ ቦታ', icon: ShoppingCart },
  { id: 'approvals', label: 'Payment Approvals', am: 'የክፍያ ማረጋገጫ', icon: ClipboardCheck },
  { id: 'trucks', label: 'Trucks & Settings', am: 'መኪናዎች', icon: Container },
  { id: 'dispatch', label: 'Gate Pass & Trucks', am: 'የበር መውጫ', icon: Truck },
  { id: 'ledger', label: 'Credit & Ledger', am: 'የብድር መዝገብ', icon: BookUser },
  { id: 'inventory', label: 'Inventory', am: 'ቆጠራ', icon: Boxes },
];

export default function App() {
  const { role, setRole, info } = useRole();
  const { user, loading: authLoading, logout } = useAdminAuth();
  const [tab, setTab] = useState<TabId>(info.defaultTab);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // The tab the user is trying to reach that needs admin auth. We open the
  // login modal, then navigate there on success.
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);

  const visibleNav = useMemo(() => NAV.filter((n) => canAccess(role, n.id)), [role]);

  // When role changes, jump to that role's default tab.
  useEffect(() => {
    setTab(info.defaultTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // If the active tab is not permitted for the current session role, reset.
  // If the active tab requires admin auth and no admin is signed in, reset
  // to the role's default (non-admins never land on a locked tab on load).
  useEffect(() => {
    if (!canAccess(role, tab)) {
      setTab(info.defaultTab);
      return;
    }
    if (requiresAdminAuth(tab) && !user) {
      setTab(info.defaultTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, tab, user]);

  useEffect(() => {
    setMobileOpen(false);
  }, [tab]);

  const active = NAV.find((n) => n.id === tab)!;

  // Determine whether the active tab is blocked: not permitted for role, OR
  // admin-only with no signed-in admin.
  const roleDenied = !canAccess(role, tab);
  const authDenied = requiresAdminAuth(tab) && !user;
  const denied = roleDenied || authDenied;

  // Navigate to a tab, opening the admin login modal first if it's locked.
  const goSafe = (t: TabId) => {
    if (!canAccess(role, t)) {
      // Non-admin role trying an admin-only tab → redirect to their default.
      setTab(info.defaultTab);
      return;
    }
    if (requiresAdminAuth(t) && !user) {
      setPendingTab(t);
      setLoginOpen(true);
      return;
    }
    setTab(t);
  };

  const onLoginSuccess = () => {
    setLoginOpen(false);
    const target = pendingTab ?? 'dashboard';
    setPendingTab(null);
    setTab(target);
  };

  const onLogout = () => {
    logout();
    // After logout, leave admin-only tabs immediately.
    if (requiresAdminAuth(tab)) {
      setTab(info.defaultTab);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-500">
          <HardHat className="w-8 h-8 animate-pulse" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-20 flex items-center gap-3 px-6 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <HardHat className="w-6 h-6 text-slate-900" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-[15px] tracking-tight">GARVELGO SYSTEM</div>
            <div className="text-[11px] text-slate-400 am">የግንባታ እቃ ሽያጭ እና መቆጣጠሪያ ሲስተም</div>
          </div>
        </div>

        {/* Session role selector */}
        <div className="mx-3 mt-3 mb-1">
          <div className="grid grid-cols-3 gap-1.5">
            {ROLE_ORDER.map((id) => {
              const r = ROLES[id];
              const isActive = role === id;
              return (
                <button
                  key={id}
                  onClick={() => setRole(id)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg py-2 px-1 text-center transition-all ${
                    isActive
                      ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-slate-900 shadow-lg shadow-orange-500/20'
                      : 'bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="text-[11px] font-bold leading-tight">{r.label}</span>
                  <span className={`am text-[10px] leading-tight ${isActive ? 'text-slate-800/80' : 'text-slate-500'}`}>{r.am}</span>
                </button>
              );
            })}
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = tab === item.id;
            const permitted = canAccess(role, item.id);
            const locked = permitted && requiresAdminAuth(item.id) && !user;
            return (
              <button
                key={item.id}
                onClick={() => goSafe(item.id)}
                disabled={!permitted}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 shadow-lg shadow-orange-500/20'
                    : permitted
                      ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      : 'text-slate-600 cursor-not-allowed opacity-40'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
                <span className="flex-1 text-left">
                  <span className="block">{item.label}</span>
                  <span className={`block text-[11px] am ${isActive ? 'text-slate-800/70' : 'text-slate-500'} group-hover:text-slate-400`}>
                    {item.am}
                  </span>
                </span>
                {locked && <Shield className="w-4 h-4 text-amber-400/80 shrink-0" />}
              </button>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-slate-800 text-[11px] text-slate-500">
          <div className="am">የግንባታ እቃ ሽያጭ እና መቆጣጠሪያ</div>
          <div className="mt-0.5">GARVELGO SYSTEM</div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 lg:h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 flex items-center px-4 lg:px-8 gap-4">
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="hidden sm:flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <HardHat className="w-5 h-5 text-slate-900" strokeWidth={2.2} />
            </div>
            <div className="leading-none">
              <div className="font-bold text-sm tracking-tight">GARVELGO SYSTEM</div>
              <div className="am text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">የግንባታ እቃ ሽያጭ እና መቆጣጠሪያ</div>
            </div>
          </div>
          <div className="hidden sm:block h-8 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg lg:text-xl font-bold tracking-tight truncate">{active.label}</h1>
            <p className="am text-xs text-slate-500 dark:text-slate-400 truncate">{active.am}</p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{fmtEthDate(new Date())}</span>
          </div>
          <ThemeToggle />
          <NotificationBell />
          <AdminSessionBadge onLogout={onLogout} />
          <RoleSwitcher />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div key={tab} className="animate-fade-in-up">
            {denied ? (
              <AccessDenied
                reason={authDenied ? 'admin-auth' : 'role'}
                onBack={() => setTab(info.defaultTab)}
                onLogin={authDenied ? () => setLoginOpen(true) : undefined}
              />
            ) : (
              <>
                {tab === 'dashboard' && <Dashboard onNavigate={goSafe} />}
                {tab === 'pos' && <POS />}
                {tab === 'approvals' && <Approvals />}
                {tab === 'trucks' && <Trucks />}
                {tab === 'dispatch' && <Dispatch />}
                {tab === 'ledger' && <Ledger />}
                {tab === 'inventory' && <Inventory />}
              </>
            )}
          </div>
        </main>
        <div className="no-print">
          <AppFooter />
        </div>
      </div>

      <NotificationToasts />

      {loginOpen && (
        <AdminLogin onClose={() => { setLoginOpen(false); setPendingTab(null); }} onSuccess={onLoginSuccess} />
      )}
    </div>
  );
}
