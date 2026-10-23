import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useNotifications } from '@/lib/notifications';
import { fmtDateTime } from '@/lib/format';
import type { AppNotification } from '@/lib/types';

const DOT: Record<AppNotification['kind'], string> = {
  pending: 'bg-amber-500',
  approved: 'bg-emerald-500',
  rejected: 'bg-red-500',
  exited: 'bg-sky-500',
  returned: 'bg-slate-400',
  info: 'bg-slate-400',
};

export default function NotificationBell() {
  const { items, unread, markAllRead } = useNotifications();
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
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
        className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden animate-fade-in-up">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-sm font-bold">
            Notifications <span className="am text-xs font-normal text-slate-400">ማሳወቂያዎች</span>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {items.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No notifications yet.</p>}
            {items.map((n) => (
              <div key={n.id} className="px-4 py-3 flex gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[n.kind]}`} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {n.title} {n.title_am && <span className="am text-xs font-normal text-slate-400">{n.title_am}</span>}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 break-words">{n.message}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{fmtDateTime(n.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Floating real-time toasts (top-right). */
export function NotificationToasts() {
  const { toasts, dismissToast } = useNotifications();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[70] space-y-2 w-80 max-w-[92vw] no-print">
      {toasts.map((n) => (
        <div
          key={n.id}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3.5 flex gap-3 animate-fade-in-up"
        >
          <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[n.kind]}`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {n.title} {n.title_am && <span className="am text-xs font-normal text-slate-400">{n.title_am}</span>}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 break-words">{n.message}</div>
          </div>
          <button onClick={() => dismissToast(n.id)} className="text-slate-400 hover:text-slate-600 self-start" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
