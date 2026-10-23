import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/**
 * Calls `onChange` whenever one of the given tables changes (Supabase Realtime),
 * plus a slow polling fallback in case Realtime is not enabled for the table.
 */
export function useRealtimeRefresh(tables: string[], onChange: () => void, pollMs = 20000) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(',');

  useEffect(() => {
    const channel = supabase.channel(`rt-${key}-${Math.random().toString(36).slice(2, 8)}`);
    key.split(',').forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => cb.current());
    });
    channel.subscribe();
    const timer = window.setInterval(() => cb.current(), pollMs);
    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [key, pollMs]);
}
