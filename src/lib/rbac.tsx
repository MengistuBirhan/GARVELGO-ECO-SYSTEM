import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type RoleId = 'admin' | 'cashier' | 'gatekeeper';

export type TabId = 'dashboard' | 'pos' | 'approvals' | 'trucks' | 'dispatch' | 'ledger' | 'inventory';

// Tabs that require a signed-in admin (not just a session role) to access.
export const ADMIN_ONLY_TABS: TabId[] = ['dashboard', 'inventory', 'approvals', 'trucks'];

export function requiresAdminAuth(tab: TabId): boolean {
  return ADMIN_ONLY_TABS.includes(tab);
}

export interface RoleInfo {
  id: RoleId;
  label: string;
  am: string;
  desc: string;
  descAm: string;
  defaultTab: TabId;
  allowed: TabId[];
}

export const ROLES: Record<RoleId, RoleInfo> = {
  admin: {
    id: 'admin',
    label: 'Admin',
    am: 'አስተዳዳሪ',
    desc: 'Full access to all modules, analytics, and settings.',
    descAm: 'ለሁሉም ክፍሎች ሙሉ መዳረሻ አለው።',
    defaultTab: 'dashboard',
    allowed: ['dashboard', 'pos', 'approvals', 'trucks', 'dispatch', 'ledger', 'inventory'],
  },
  cashier: {
    id: 'cashier',
    label: 'Cashier',
    am: 'ካሺየር',
    desc: 'POS & Sales. Submit sales with an available pre-registered truck and track their status.',
    descAm: 'ሽያጭ መዝግብ፣ ዝግጁ መኪና ምረጥ፣ ሁኔታውን ተከታተል።',
    defaultTab: 'pos',
    allowed: ['pos', 'dispatch'],
  },
  gatekeeper: {
    id: 'gatekeeper',
    label: 'Security',
    am: 'ጥበቃ',
    desc: 'Gate security only. Confirm truck exit and return, print gate passes.',
    descAm: 'የበር ጥበቃ ብቻ። የመኪና መውጫና መመለስ ያረጋግጡ።',
    defaultTab: 'dispatch',
    allowed: ['dispatch'],
  },
};

export const ROLE_ORDER: RoleId[] = ['admin', 'cashier', 'gatekeeper'];

export function canAccess(role: RoleId, tab: TabId): boolean {
  return ROLES[role].allowed.includes(tab);
}

interface RoleContextValue {
  role: RoleId;
  setRole: (r: RoleId) => void;
  info: RoleInfo;
}

const RoleContext = createContext<RoleContextValue | null>(null);
const STORAGE_KEY = 'garvelgo:role';

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<RoleId>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY) as RoleId | null;
      if (saved && ROLES[saved]) return saved;
    }
    return 'admin';
  });

  const setRole = (r: RoleId) => {
    setRoleState(r);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, r);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, role);
    }
  }, [role]);

  const value = useMemo<RoleContextValue>(
    () => ({ role, setRole, info: ROLES[role] }),
    [role],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
