import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLogs,
  fetchLogStats,
  type ActivityLogEntry,
  type LogFilters,
} from '../lib/api-client';

export function useLogs(filters: LogFilters) {
  return useQuery({
    queryKey: ['logs', filters],
    queryFn: () => fetchLogs(filters),
    refetchInterval: 5_000,
  });
}

export function useLogStats() {
  return useQuery({
    queryKey: ['logs', 'stats'],
    queryFn: fetchLogStats,
    refetchInterval: 10_000,
  });
}

export function useLogStream(onEntry: (entry: ActivityLogEntry) => void) {
  const esRef = useRef<EventSource | null>(null);
  const onEntryRef = useRef(onEntry);
  onEntryRef.current = onEntry;

  const [isConnected, setIsConnected] = useState(false);

  const disconnect = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    disconnect();
    const es = new EventSource('/api/logs/stream');
    esRef.current = es;
    es.onopen = () => setIsConnected(true);
    es.onerror = () => {
      setIsConnected(false);
    };
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as unknown;
        if (
          data &&
          typeof data === 'object' &&
          'type' in data &&
          (data as { type?: string }).type === 'connected'
        ) {
          return;
        }
        if (
          data &&
          typeof data === 'object' &&
          'id' in data &&
          'timestamp' in data &&
          'source' in data
        ) {
          onEntryRef.current(data as ActivityLogEntry);
        }
      } catch {
        /* ignore malformed SSE payloads */
      }
    };
  }, [disconnect]);

  useEffect(() => () => disconnect(), [disconnect]);

  return { isConnected, connect, disconnect };
}
