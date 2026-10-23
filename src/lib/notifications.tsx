import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useRole } from './rbac';
import type { AppNotification } from './types';

interface Ctx {
  items: AppNotification[];
  unread: number;
  markAllRead: () => void;
  toasts: AppNotification[];
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<Ctx | null>(null);
const seenKey = (role: string) => `garvelgo:notif-seen:${role}`;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { role } = useRole();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [seenAt, setSeenAt] = useState<string>('');
  const known = useRef<Set<string>>(new Set());

  // Load history + subscribe whenever the session role changes.
  useEffect(() => {
    let cancelled = false;
    known.current = new Set();
    setItems([]);
    setToasts([]);
    setSeenAt(window.localStorage.getItem(seenKey(role)) ?? '');

    const push = (n: AppNotification, toast: boolean) => {
      if (n.audience !== role || known.current.has(n.id)) return;
      known.current.add(n.id);
      setItems((prev) => [n, ...prev].slice(0, 50));
      if (toast) {
        setToasts((prev) => [n, ...prev].slice(0, 4));
        window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), 8000);
      }
    };

    (async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('audience', role)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      (data ?? []).slice().reverse().forEach((n) => push(n as AppNotification, false));
    })();

    const channel = supabase
      .channel(`notif-${role}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) =>
        push(payload.new as AppNotification, true),
      )
      .subscribe();

    // Polling fallback (e.g. Realtime not enabled yet).
    const timer = window.setInterval(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('audience', role)
        .order('created_at', { ascending: false })
        .limit(10);
      (data ?? []).slice().reverse().forEach((n) => push(n as AppNotification, true));
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [role]);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    window.localStorage.setItem(seenKey(role), now);
    setSeenAt(now);
  }, [role]);

  const dismissToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const unread = useMemo(
    () => items.filter((n) => !seenAt || new Date(n.created_at) > new Date(seenAt)).length,
    [items, seenAt],
  );

  const value = useMemo(
    () => ({ items, unread, markAllRead, toasts, dismissToast }),
    [items, unread, markAllRead, toasts, dismissToast],
  );
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
