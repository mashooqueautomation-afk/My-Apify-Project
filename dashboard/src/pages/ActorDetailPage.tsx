import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot, Play, Code2, Settings, History,
  Save, ExternalLink, Copy, CheckCircle,
} from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { actorsApi } from '../api/client';
import {
  StatusBadge, Button, Modal, PageHeader,
} from '../components/ui/StatusBadge';

type Tab = 'overview' | 'code' | 'runs' | 'settings';

// ─── Simple code editor (textarea-based) ──────────────────────────────────────
function CodeEditor({ value, onChange, language = 'javascript', readOnly = false }: {
  value: string; onChange?: (v: string) => void;
  language?: string; readOnly?: boolean;
}) {
  return (
    <div className="relative rounded-lg overflow-hidden border border-gray-700 bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700">
        <span className="text-xs text-gray-500 font-mono">{language}</span>
        <button
          className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1"
          onClick={() => navigator.clipboard.writeText(value)}
        >
          <Copy size={11} /> Copy
        </button>
      </div>
      <textarea
        value={value}
        onChange={e => onChange?.(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        className="w-full h-96 p-4 bg-gray-950 text-green-400 font-mono text-xs resize-none focus:outline-none leading-relaxed"
      />
    </div>
  );
}

// ─── Run Actor Modal ──────────────────────────────────────────────────────────
function RunModal({ actor, isOpen, onClose }: {
  actor: any; isOpen: boolean; onClose: () => void;
}) {
  const [inputJson, setInputJson] = useState(
    JSON.stringify(actor?.input_schema?.example ?? {}, null, 2)
  );
  const [memoryMb, setMemoryMb] = useState(512);
  const [timeoutSecs, setTimeoutSecs] = useState(3600);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: ({ input, options }: any) => actorsApi.run(actor.id, input, options),
    onSuccess: (run) => {
      onClose();
      window.location.href = `/runs/${run.id}`;
    },
  });

  const handleRun = () => {
    try {
      const input = JSON.parse(inputJson);
      setError('');
      mutation.mutate({ input, options: { memoryMbytes: memoryMb, timeoutSecs } });
    } catch { setError('Invalid JSON in input'); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Run: ${actor?.name}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Input (JSON)</label>
          <textarea
            value={inputJson}
            onChange={e => { setInputJson(e.target.value); setError(''); }}
            rows={8}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-green-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Memory (MB)</label>
            <select
              value={memoryMb}
              onChange={e => setMemoryMb(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[128, 256, 512, 1024, 2048, 4096, 8192].map(m => (
                <option key={m} value={m}>{m} MB</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Timeout</label>
            <select
              value={timeoutSecs}
              onChange={e => setTimeoutSecs(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={300}>5 minutes</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
              <option value={7200}>2 hours</option>
              <option value={86400}>24 hours</option>
            </select>
          </div>
        </div>

        {mutation.error && (
          <p className="text-sm text-red-400">
            {(mutation.error as any)?.response?.data?.error?.message ?? 'Failed to start'}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={handleRun}>
            <Play size={14} /> Start Run
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main ActorDetailPage ─────────────────────────────────────────────────────
export default function ActorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [showRun, setShowRun] = useState(false);
  const [editedCode, setEditedCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: actor, isLoading } = useQuery({
    queryKey: ['actor', id],
    queryFn: () => actorsApi.get(id!),
  });

  const { data: runsData } = useQuery({
    queryKey: ['actor-runs', id],
    queryFn: () => actorsApi.getRuns(id!, { limit: 20 }),
    enabled: tab === 'runs' || tab === 'overview',
    refetchInterval: tab === 'runs' ? 10_000 : false,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => actorsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actor', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSaveCode = () => {
    if (editedCode !== null) {
      updateMutation.mutate({ sourceCode: editedCode });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="p-6">
        <p className="text-gray-400">Actor not found.</p>
      </div>
    );
  }

  const runs = runsData?.data ?? [];
  const successRate = actor.total_runs > 0
    ? Math.round((actor.success_runs / actor.total_runs) * 100)
    : 0;

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview',  icon: Bot      },
    { id: 'code',     label: 'Source',    icon: Code2    },
    { id: 'runs',     label: 'Runs',      icon: History  },
    { id: 'settings', label: 'Settings',  icon: Settings },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <Bot size={22} className="text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{actor.name}</h1>
              <StatusBadge status={actor.status} />
            </div>
            <p className="text-gray-400 text-sm mt-0.5">
              {actor.runtime} · v{actor.version}
              {actor.description && ` · ${actor.description}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {tab === 'code' && editedCode !== null && (
            <Button
              variant={saved ? 'secondary' : 'primary'}
              size="sm"
              loading={updateMutation.isPending}
              onClick={handleSaveCode}
            >
              {saved
                ? <><CheckCircle size={14} /> Saved</>
                : <><Save size={14} /> Save</>
              }
            </Button>
          )}
          <Button variant="primary" onClick={() => setShowRun(true)}>
            <Play size={14} /> Run Actor
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-800 pb-0">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === tabId
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Runs',    value: actor.total_runs },
              { label: 'Success Rate',  value: `${successRate}%` },
              { label: 'Avg Duration',  value: actor.avg_duration_secs ? `${actor.avg_duration_secs}s` : '—' },
              { label: 'Tags',          value: actor.tags?.join(', ') || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className="text-lg font-bold text-white truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Recent runs mini table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Recent Runs</h3>
              <button
                onClick={() => setTab('runs')}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                View all →
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Status', 'Duration', 'Items', 'Started'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {runs.slice(0, 5).map((run: any) => (
                  <tr key={run.id} className="hover:bg-gray-800/30">
                    <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-5 py-3 text-gray-400">{run.duration_secs ? `${run.duration_secs}s` : '—'}</td>
                    <td className="px-5 py-3 text-gray-400">{run.stats?.items_scraped ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {run.created_at && formatDistanceToNow(parseISO(run.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
                {!runs.length && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-500 text-sm">No runs yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Code tab ─────────────────────────────────────────────── */}
      {tab === 'code' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Edit actor source code. Save to apply changes to future runs.
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Runtime:</span>
              <span className="bg-gray-800 text-gray-300 px-2 py-1 rounded font-mono">{actor.runtime}</span>
            </div>
          </div>
          <CodeEditor
            value={editedCode ?? (actor.source_code || '// No source code available')}
            onChange={setEditedCode}
            language={actor.runtime === 'python310' ? 'python' : 'javascript'}
          />
          {actor.source_code === null && (
            <p className="text-xs text-yellow-500">
              ⚠ This actor uses a Docker image ({actor.docker_image || 'custom'}). Source editing not available.
            </p>
          )}
        </div>
      )}

      {/* ── Runs tab ─────────────────────────────────────────────── */}
      {tab === 'runs' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Run ID', 'Status', 'Duration', 'Items', 'Memory', 'CU', 'Started', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {runs.map((run: any) => (
                <tr key={run.id} className="hover:bg-gray-800/30">
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{run.id.slice(0, 8)}…</td>
                  <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
                  <td className="px-5 py-3 text-gray-400">{run.duration_secs ? `${run.duration_secs}s` : '—'}</td>
                  <td className="px-5 py-3 text-gray-400">{run.stats?.items_scraped ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-400">{run.memory_mb}MB</td>
                  <td className="px-5 py-3 text-gray-400">
                    {run.compute_units ? parseFloat(run.compute_units).toFixed(3) : '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {run.created_at && format(parseISO(run.created_at), 'MMM dd, HH:mm')}
                  </td>
                  <td className="px-5 py-3">
                    <Link to={`/runs/${run.id}`} className="text-xs text-blue-400 hover:text-blue-300">
                      Details →
                    </Link>
                  </td>
                </tr>
              ))}
              {!runs.length && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-500 text-sm">No runs yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Settings tab ─────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="max-w-lg space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">General</h3>

            {[
              { label: 'Name',        value: actor.name },
              { label: 'Runtime',     value: actor.runtime },
              { label: 'Version',     value: actor.version },
              { label: 'Docker Image',value: actor.docker_image || 'platform default' },
              { label: 'Public',      value: actor.is_public ? 'Yes' : 'No' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <span className="text-sm text-gray-400">{label}</span>
                <span className="text-sm text-white font-mono">{value}</span>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Default Run Options</h3>
            {[
              { label: 'Memory',  value: `${actor.default_run_options?.memoryMbytes ?? 512} MB` },
              { label: 'Timeout', value: `${actor.default_run_options?.timeoutSecs ?? 3600}s` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <span className="text-sm text-gray-400">{label}</span>
                <span className="text-sm text-white">{value}</span>
              </div>
            ))}
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h3>
            <p className="text-xs text-gray-400 mb-3">
              Archiving an actor will prevent new runs. Existing data is preserved.
            </p>
            <Button
              variant="danger" size="sm"
              onClick={() => {
                if (confirm('Archive this actor? It can be restored later.')) {
                  updateMutation.mutate({ status: 'archived' });
                }
              }}
            >
              Archive Actor
            </Button>
          </div>
        </div>
      )}

      {/* Run Modal */}
      {showRun && (
        <RunModal actor={actor} isOpen={showRun} onClose={() => setShowRun(false)} />
      )}
    </div>
  );
}
