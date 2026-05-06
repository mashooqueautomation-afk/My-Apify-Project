// ─── Runs List Page ───────────────────────────────────────────────────────────
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Play, StopCircle, Clock, Database, CheckCircle, XCircle } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { runsApi, datasetsApi } from '../api/client';
import { StatusBadge, Button, PageHeader, EmptyState } from '../components/ui/StatusBadge';
import { useEffect, useRef } from 'react';

export default function RunsPage() {
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['runs', statusFilter],
    queryFn: () => runsApi.list({ limit: 30, status: statusFilter || undefined }),
    refetchInterval: 10_000,
  });

  const runs = data?.data || [];
  const STATUSES = ['', 'running', 'queued', 'succeeded', 'failed', 'aborted'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Runs" description="All actor execution history" />

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        {STATUSES.map(s => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Actor', 'Status', 'Duration', 'Items', 'Memory', 'Started', ''].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {runs.map((run: any) => (
              <tr key={run.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-5 py-3">
                  <span className="text-blue-400 font-medium">{run.actor_name}</span>
                  <p className="text-xs text-gray-600 font-mono">{run.id.slice(0, 8)}…</p>
                </td>
                <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
                <td className="px-5 py-3 text-gray-400">{run.duration_secs ? `${run.duration_secs}s` : '—'}</td>
                <td className="px-5 py-3 text-gray-400">{run.stats?.items_scraped || '—'}</td>
                <td className="px-5 py-3 text-gray-400">{run.memory_mb}MB</td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {run.created_at && formatDistanceToNow(parseISO(run.created_at), { addSuffix: true })}
                </td>
                <td className="px-5 py-3">
                  <Link to={`/runs/${run.id}`} className="text-xs text-blue-400 hover:text-blue-300">
                    Details →
                  </Link>
                </td>
              </tr>
            ))}
            {!runs.length && !isLoading && (
              <tr><td colSpan={7} className="py-14 text-center text-gray-500 text-sm">No runs found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Run Detail Page ──────────────────────────────────────────────────────────
export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const logsRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logOffset, setLogOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: run, refetch } = useQuery({
    queryKey: ['run', id],
    queryFn: () => runsApi.get(id!),
    refetchInterval: (data) =>
      ['queued', 'running'].includes(data?.status) ? 3000 : false,
  });

  // Poll logs when running
  useEffect(() => {
    if (!id || !['running', 'queued'].includes(run?.status || '')) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const result = await runsApi.getLogs(id, logOffset);
        if (cancelled) return;

        if (result.items.length) {
          setLogs(prev => [...prev, ...result.items]);
          setLogOffset(result.nextOffset);
        }

        timeoutId = setTimeout(poll, result.items.length ? 2000 : 3500);
      } catch {
        if (cancelled) return;
        timeoutId = setTimeout(poll, 5000);
      }
    };

    timeoutId = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [id, run?.status, logOffset]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Load initial logs
  useEffect(() => {
    if (!id) return;
    setLogs([]);
    setLogOffset(0);
    runsApi.getLogs(id, 0).then(r => {
      setLogs(r.items);
      setLogOffset(r.nextOffset);
    });
  }, [id]);

  const abortMutation = useMutation({
    mutationFn: () => runsApi.abort(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['run', id] }),
  });

  if (!run) return (
    <div className="p-6 flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  );

  const isActive = ['queued', 'running'].includes(run.status);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white font-mono">{run.id.slice(0, 12)}…</h1>
            <StatusBadge status={run.status} />
          </div>
          <p className="text-gray-400 text-sm">Actor: <span className="text-blue-400">{run.actor_name}</span></p>
        </div>
        {isActive && (
          <Button
            variant="danger" size="sm"
            loading={abortMutation.isPending}
            onClick={() => abortMutation.mutate()}
          >
            <StopCircle size={14} /> Abort
          </Button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Duration', value: run.duration_secs ? `${run.duration_secs}s` : '—', icon: Clock },
          { label: 'Items Scraped', value: run.stats?.items_scraped?.toLocaleString() || '—', icon: Database },
          { label: 'Memory', value: `${run.memory_mb}MB`, icon: Play },
          { label: 'Compute Units', value: run.compute_units ? parseFloat(run.compute_units).toFixed(4) : '—', icon: CheckCircle },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-lg font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Error */}
      {run.error_message && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-red-400 mb-1">Error</p>
          <p className="text-sm text-red-300 font-mono">{run.error_message}</p>
        </div>
      )}

      {/* Dataset link */}
      {run.dataset_id && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database size={18} className="text-blue-400" />
            <div>
              <p className="text-sm font-medium text-white">Dataset</p>
              <p className="text-xs text-gray-500">{run.dataset_id}</p>
            </div>
          </div>
          <Link to={`/datasets/${run.dataset_id}`}>
            <Button size="sm" variant="secondary">View Data →</Button>
          </Link>
        </div>
      )}

      {/* Log viewer */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Run Log</h3>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
        </div>
        <div
          ref={logsRef}
          className="h-80 overflow-y-auto p-4 font-mono text-xs text-green-400 bg-gray-950"
        >
          {logs.length === 0 ? (
            <p className="text-gray-600">
              {isActive
                ? 'Waiting for logs…'
                : run.error_message
                  ? 'Run failed before any actor logs were captured. See the error panel above.'
                  : 'No logs recorded'}
            </p>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="hover:bg-gray-900/50 px-1 py-0.5 rounded whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          )}
          {isActive && (
            <div className="flex items-center gap-2 text-gray-500 mt-2">
              <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Running…
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Input</h3>
        <pre className="text-xs text-gray-300 font-mono overflow-auto max-h-40">
          {JSON.stringify(run.input, null, 2)}
        </pre>
      </div>
    </div>
  );
}
