import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Database, Download, Trash2, Search,
  ArrowUpDown, FileJson, FileText, BarChart3,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { datasetsApi } from '../api/client';
import { Button, EmptyState, PageHeader } from '../components/ui/StatusBadge';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function DatasetsPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn:  () => datasetsApi.list(),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: datasetsApi.delete,
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['datasets'] }),
  });

  const datasets: any[] = (data?.data ?? []).filter((d: any) =>
    !search || d.actor_name?.toLowerCase().includes(search.toLowerCase()) || d.id.includes(search)
  );

  const totalItems = datasets.reduce((sum, d) => sum + (d.item_count || 0), 0);
  const totalBytes = datasets.reduce((sum, d) => sum + (d.size_bytes || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Datasets"
        description="Scraped data storage — browse, export, and manage your datasets"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Datasets', value: datasets.length, icon: Database },
          { label: 'Total Items',    value: totalItems.toLocaleString(), icon: BarChart3 },
          { label: 'Storage Used',   value: formatBytes(totalBytes), icon: FileJson },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/15 flex items-center justify-center flex-shrink-0">
              <Icon size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-lg font-bold text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search datasets by ID or actor…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : datasets.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No datasets yet"
            description="Datasets are created automatically when you run an actor"
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Dataset ID', 'Actor', 'Items', 'Size', 'Fields', 'Created', 'Export', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {datasets.map((ds: any) => (
                <tr key={ds.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="px-5 py-3">
                    <Link to={`/datasets/${ds.id}`} className="font-mono text-xs text-blue-400 hover:text-blue-300">
                      {ds.id.slice(0, 12)}…
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    {ds.actor_name ? (
                      <span className="text-gray-300">{ds.actor_name}</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-semibold text-white">{ds.item_count?.toLocaleString() ?? 0}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-400">{formatBytes(ds.size_bytes)}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(ds.fields ?? []).slice(0, 3).map((f: string) => (
                        <span key={f} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono">
                          {f}
                        </span>
                      ))}
                      {(ds.fields?.length ?? 0) > 3 && (
                        <span className="text-xs text-gray-600">+{ds.fields.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {ds.created_at
                      ? formatDistanceToNow(parseISO(ds.created_at), { addSuffix: true })
                      : '—'}
                  </td>
                  {/* Export buttons */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(['json', 'csv', 'jsonl'] as const).map(fmt => (
                        <a
                          key={fmt}
                          href={datasetsApi.exportUrl(ds.id, fmt)}
                          download
                          title={`Export as ${fmt.toUpperCase()}`}
                        >
                          <button className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors">
                            {fmt}
                          </button>
                        </a>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Link to={`/datasets/${ds.id}`}>
                        <Button size="sm" variant="ghost" className="text-xs">
                          View →
                        </Button>
                      </Link>
                      <Button
                        size="sm" variant="ghost"
                        className="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100"
                        onClick={() =>
                          confirm(`Delete dataset with ${ds.item_count} items?`) &&
                          deleteMutation.mutate(ds.id)
                        }
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
