import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';

// ─── useRunLogs — live log streaming via SSE ─────────────────────────────────
export function useRunLogs(runId: string | undefined, enabled = true) {
  const [logs, setLogs]         = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone]         = useState(false);
  const eventSourceRef          = useRef<EventSource | null>(null);
  const { token }               = useAuthStore();

  useEffect(() => {
    if (!runId || !enabled || !token) return;

    setLogs([]);
    setDone(false);
    setConnected(false);

    // Close existing connection
    eventSourceRef.current?.close();

    const url = `/api/v1/runs/${runId}/log/stream?token=${encodeURIComponent(token)}`;
    const es  = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const { line } = JSON.parse(event.data);
        if (line) setLogs(prev => [...prev, line]);
      } catch { /* ignore malformed */ }
    };

    es.addEventListener('done', () => {
      setDone(true);
      setConnected(false);
      es.close();
    });

    es.onerror = () => {
      setConnected(false);
      // SSE auto-reconnects on error — don't close
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [runId, enabled, token]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, connected, done, clearLogs };
}

// ─── useRunStatus — poll run status until terminal ────────────────────────────
const TERMINAL_STATUSES = ['succeeded', 'failed', 'aborted', 'timeout'];

export function useRunStatus(
  runId: string | undefined,
  onComplete?: (status: string) => void
) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const resp = await fetch(`/api/v1/runs/${runId}`, {
          headers: {
            Authorization: `Bearer ${useAuthStore.getState().token}`,
          },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const s    = data?.data?.status;

        if (s) {
          setStatus(s);
          queryClient.setQueryData(['run', runId], data.data);

          if (TERMINAL_STATUSES.includes(s)) {
            onComplete?.(s);
            return; // Stop polling
          }
        }

        timeoutId = setTimeout(poll, 3000);
      } catch {
        timeoutId = setTimeout(poll, 5000); // Back-off on error
      }
    };

    poll();
    return () => clearTimeout(timeoutId);
  }, [runId, queryClient, onComplete]);

  return status;
}

// ─── useQueueDepth — monitor BullMQ queue depth ──────────────────────────────
export function useQueueDepth(refetchInterval = 10_000) {
  const [depths, setDepths] = useState({ waiting: 0, active: 0, failed: 0 });

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const resp = await fetch('/api/v1/metrics/overview', {
          headers: {
            Authorization: `Bearer ${useAuthStore.getState().token}`,
          },
        });
        const data = await resp.json();
        setDepths({
          waiting: parseInt(data?.data?.runs?.active_runs || '0'),
          active:  parseInt(data?.data?.runs?.active_runs || '0'),
          failed:  0,
        });
      } catch { /* noop */ }
    };

    fetch_();
    const id = setInterval(fetch_, refetchInterval);
    return () => clearInterval(id);
  }, [refetchInterval]);

  return depths;
}

// ─── useNotifications — browser push notifications for run completion ─────────
export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const notify = useCallback((title: string, body: string, icon?: string) => {
    if (permission !== 'granted') return;
    try {
      new Notification(title, {
        body,
        icon: icon || '/favicon.svg',
        badge: '/favicon.svg',
        tag:   'webminer-run',
      });
    } catch { /* noop — Safari sometimes throws */ }
  }, [permission]);

  return { permission, requestPermission, notify };
}

// ─── useDebounce — debounce a value ──────────────────────────────────────────
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

// ─── useLocalStorage — persist state in localStorage ─────────────────────────
export function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(prev)
        : newValue;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, [key]);

  return [value, set] as const;
}
