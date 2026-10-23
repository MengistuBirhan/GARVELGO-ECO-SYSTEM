import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type AdminRole = 'admin' | 'cashier' | 'gatekeeper';

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  mustChangePassword: boolean;
  creditAuthorized: boolean;
}

interface AdminAuthValue {
  user: AdminUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string; mustChangePassword?: boolean }>;
  changePassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  resetPassword: (recoveryKey: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);
const SESSION_KEY = 'garvelgo:admin-session';

interface StaffLoginRow {
  id: string;
  username: string;
  display_name: string;
  role: AdminRole;
  must_change_password: boolean;
  credit_authorized: boolean;
}

function rowToUser(r: StaffLoginRow): AdminUser {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    mustChangePassword: r.must_change_password,
    creditAuthorized: r.credit_authorized,
  };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-validate a stored session id on mount (persists across refreshes).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(SESSION_KEY) : null;
      if (!saved) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc('staff_get_user', { p_user_id: saved });
      if (cancelled) return;
      if (!error && data && (data as StaffLoginRow[]).length > 0) {
        setUser(rowToUser((data as StaffLoginRow[])[0]));
      } else {
        // invalid / deactivated — drop the stored session
        window.localStorage.removeItem(SESSION_KEY);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(username: string, password: string) {
    const { data, error } = await supabase.rpc('staff_login', {
      p_username: username.trim(),
      p_password: password,
    });
    if (error) return { ok: false, error: 'Login failed. Please try again.' };
    const rows = data as StaffLoginRow[];
    if (!rows || rows.length === 0) {
      return { ok: false, error: 'Invalid username or password.' };
    }
    const u = rowToUser(rows[0]);
    setUser(u);
    window.localStorage.setItem(SESSION_KEY, u.id);
    return { ok: true, mustChangePassword: u.mustChangePassword };
  }

  async function changePassword(newPassword: string) {
    if (!user) return { ok: false, error: 'Not signed in.' };
    if (newPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    const { error } = await supabase.rpc('staff_change_password', {
      p_user_id: user.id,
      p_new_password: newPassword,
    });
    if (error) return { ok: false, error: 'Could not update password.' };
    setUser({ ...user, mustChangePassword: false });
    return { ok: true };
  }

  async function resetPassword(recoveryKey: string, newPassword: string) {
    if (newPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters.' };
    const { data, error } = await supabase.rpc('staff_reset_admin_password', {
      p_recovery_key: recoveryKey.trim(),
      p_new_password: newPassword,
    });
    if (error) return { ok: false, error: 'Could not reset password. Please try again.' };
    if (!data) return { ok: false, error: 'Invalid recovery key.' };
    return { ok: true };
  }

  function logout() {
    setUser(null);
    window.localStorage.removeItem(SESSION_KEY);
  }

  const value = useMemo<AdminAuthValue>(
    () => ({ user, loading, login, changePassword, resetPassword, logout }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
