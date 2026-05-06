// ─── Dataset Detail Page ──────────────────────────────────────────────────────
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { datasetsApi } from '../api/client';
import { Button, PageHeader } from '../components/ui/StatusBadge';
import { Download } from 'lucide-react';

export function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const { data: ds } = useQuery({
    queryKey: ['dataset', id],
    queryFn: () => datasetsApi.get(id!),
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ['dataset-items', id, offset],
    queryFn: () => datasetsApi.getItems(id!, { offset, limit: LIMIT }),
  });

  const columns = ds?.fields?.length ? ds.fields : Object.keys(items?.data?.[0] || {}).slice(0, 10);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title={`Dataset: ${id?.slice(0, 12)}…`}
        description={`${ds?.item_count?.toLocaleString() || 0} items · ${ds?.fields?.join(', ') || 'no fields'}`}
        actions={
          <div className="flex gap-2">
            {(['json', 'csv', 'jsonl'] as const).map(fmt => (
              <a key={fmt} href={datasetsApi.exportUrl(id!, fmt)} download>
                <Button size="sm" variant="secondary">
                  <Download size={12} /> {fmt.toUpperCase()}
                </Button>
              </a>
            ))}
          </div>
        }
      />

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 text-left text-gray-500 font-medium">#</th>
                {columns.map((col: string) => (
                  <th key={col} className="px-4 py-3 text-left text-gray-500 font-medium uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {(items?.data || []).map((row: any, i: number) => (
                <tr key={i} className="hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-600">{offset + i + 1}</td>
                  {columns.map((col: string) => (
                    <td key={col} className="px-4 py-3 text-gray-300 max-w-xs truncate" title={String(row[col] ?? '')}>
                      {String(row[col] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Showing {offset + 1}–{Math.min(offset + LIMIT, ds?.item_count || 0)} of {ds?.item_count?.toLocaleString()} items
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              ← Prev
            </Button>
            <Button size="sm" variant="secondary" disabled={offset + LIMIT >= (ds?.item_count || 0)} onClick={() => setOffset(offset + LIMIT)}>
              Next →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Datasets List Page ───────────────────────────────────────────────────────
export function DatasetsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => datasetsApi.list(),
  });

  const datasets = data?.data || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Datasets" description="Scraped data storage" />
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['ID', 'Actor', 'Items', 'Size', 'Fields', 'Created', 'Actions'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs text-gray-500 uppercase font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {datasets.map((ds: any) => (
              <tr key={ds.id} className="hover:bg-gray-800/30">
                <td className="px-5 py-3 font-mono text-xs text-gray-400">{ds.id.slice(0, 12)}…</td>
                <td className="px-5 py-3 text-blue-400">{ds.actor_name || '—'}</td>
                <td className="px-5 py-3 text-white font-medium">{ds.item_count?.toLocaleString()}</td>
                <td className="px-5 py-3 text-gray-400">{ds.size_bytes > 0 ? `${(ds.size_bytes / 1024).toFixed(1)}KB` : '0'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{ds.fields?.slice(0, 3).join(', ') || '—'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{ds.created_at ? new Date(ds.created_at).toLocaleDateString() : '—'}</td>
                <td className="px-5 py-3">
                  <a href={`/datasets/${ds.id}`} className="text-xs text-blue-400 hover:text-blue-300">View →</a>
                </td>
              </tr>
            ))}
            {!datasets.length && !isLoading && (
              <tr><td colSpan={7} className="py-14 text-center text-gray-500 text-sm">No datasets yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Stub pages ───────────────────────────────────────────────────────────────
export function ActorDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="p-6">
      <PageHeader title="Actor Details" description={`ID: ${id}`} />
      <p className="text-gray-400 text-sm">Actor detail editor — code editor, runs history, settings.</p>
    </div>
  );
}

export function TasksPage() {
  return (
    <div className="p-6">
      <PageHeader title="Scheduled Tasks" description="Cron-scheduled actor runs" />
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
        <p className="text-gray-500 text-sm">Create a task with a cron expression to run actors on a schedule.</p>
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="p-6 max-w-2xl">
      <PageHeader title="Settings" description="Account and organization settings" />
      <div className="space-y-4">
        {['Profile', 'API Keys', 'Proxy Groups', 'Webhooks', 'Billing'].map(section => (
          <div key={section} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="font-medium text-white">{section}</h3>
          </div>
        ))}
      </div>
    </div>
  );
}
