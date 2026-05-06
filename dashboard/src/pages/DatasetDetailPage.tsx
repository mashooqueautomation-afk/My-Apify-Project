import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Download, ChevronLeft, ChevronRight, Columns,
  Search, FileJson, FileText, Database, RefreshCw,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { datasetsApi } from '../api/client';
import { Button, PageHeader } from '../components/ui/StatusBadge';

const PAGE_SIZE = 50;

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function CellValue({ value }: { value: any }) {
  if (value === null || value === undefined) {
    return <span className="text-gray-600 italic text-xs">null</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span className={`text-xs font-mono ${value ? 'text-green-400' : 'text-red-400'}`}>
        {String(value)}
      </span>
    );
  }
  if (typeof value === 'number') {
    return <span className="text-yellow-400 font-mono text-xs">{value.toLocaleString()}</span>;
  }
  if (typeof value === 'object') {
    return (
      <span className="text-gray-400 font-mono text-xs" title={JSON.stringify(value)}>
        {'{…}'}
      </span>
    );
  }
  const str = String(value);
  if (str.startsWith('http')) {
    return (
      <a href={str} target="_blank" rel="noreferrer"
        className="text-blue-400 hover:text-blue-300 text-xs underline truncate block max-w-xs"
        title={str}>
        {str.length > 50 ? str.slice(0, 50) + '…' : str}
      </a>
    );
  }
  return (
    <span className="text-gray-300 text-xs" title={str}>
      {str.length > 80 ? str.slice(0, 80) + '…' : str}
    </span>
  );
}

export default function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [offset, setOffset]             = useState(0);
  const [search, setSearch]             = useState('');
  const [visibleColumns, setVisibleColumns] = useState<string[] | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  const { data: ds, isLoading: loadingInfo } = useQuery({
    queryKey: ['dataset', id],
    queryFn:  () => datasetsApi.get(id!),
  });

  const { data: itemsData, isLoading: loadingItems, refetch } = useQuery({
    queryKey: ['dataset-items', id, offset],
    queryFn:  () => datasetsApi.getItems(id!, { offset, limit: PAGE_SIZE }),
    enabled:  !!id,
  });

  // Derive columns from dataset fields + first row
  const allColumns = useMemo(() => {
    const fromFields = ds?.fields ?? [];
    const fromData   = Object.keys(itemsData?.data?.[0] ?? {});
    const merged     = [...new Set([...fromFields, ...fromData])];
    return merged.slice(0, 30); // max 30 cols
  }, [ds?.fields, itemsData?.data]);

  const columns = visibleColumns ?? allColumns;

  // Client-side search filter
  const filteredItems = useMemo(() => {
    const rows = itemsData?.data ?? [];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((row: any) =>
      Object.values(row).some(v => String(v ?? '').toLowerCase().includes(q))
    );
  }, [itemsData?.data, search]);

  const totalItems  = ds?.item_count ?? 0;
  const totalPages  = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const toggleColumn = (col: string) => {
    const current = visibleColumns ?? allColumns;
    if (current.includes(col)) {
      setVisibleColumns(current.filter(c => c !== col));
    } else {
      setVisibleColumns([...current, col]);
    }
  };

  if (loadingInfo) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!ds) {
    return <div className="p-6 text-gray-400">Dataset not found.</div>;
  }

  return (
    <div className="p-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/datasets" className="text-gray-500 hover:text-gray-300 text-sm">
              ← Datasets
            </Link>
          </div>
          <h1 className="text-xl font-bold text-white font-mono">{id?.slice(0, 20)}…</h1>
          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Database size={11} />
              {totalItems.toLocaleString()} items
            </span>
            <span>{formatBytes(ds.size_bytes)}</span>
            {ds.created_at && (
              <span>Created {format(parseISO(ds.created_at), 'MMM dd, yyyy HH:mm')}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw size={13} />
          </Button>

          <div className="relative">
            <Button
              size="sm" variant="secondary"
              onClick={() => setShowColumnPicker(p => !p)}
            >
              <Columns size={13} /> Columns
              {visibleColumns && visibleColumns.length !== allColumns.length && (
                <span className="ml-1 text-blue-400">({visibleColumns.length}/{allColumns.length})</span>
              )}
            </Button>

            {/* Column picker dropdown */}
            {showColumnPicker && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 p-2 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                  <span className="text-xs font-medium text-gray-400">Toggle columns</span>
                  <button
                    className="text-xs text-blue-400 hover:text-blue-300"
                    onClick={() => setVisibleColumns(null)}
                  >
                    Reset
                  </button>
                </div>
                {allColumns.map(col => (
                  <label key={col}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 cursor-pointer"
                  >
                    <div
                      onClick={() => toggleColumn(col)}
                      className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                        columns.includes(col)
                          ? 'bg-blue-600 border-blue-600'
                          : 'bg-transparent border-gray-600'
                      }`}
                    >
                      {columns.includes(col) && (
                        <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 12 12">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs text-gray-300 font-mono">{col}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Export buttons */}
          {(['json', 'csv', 'jsonl'] as const).map(fmt => (
            <a key={fmt} href={datasetsApi.exportUrl(id!, fmt)} download>
              <Button size="sm" variant="secondary">
                <Download size={12} /> {fmt.toUpperCase()}
              </Button>
            </a>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Filter rows by any value…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
            {filteredItems.length} matches
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80 sticky top-0">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 w-12 sticky left-0 bg-gray-900">
                  #
                </th>
                {columns.map(col => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {loadingItems ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={columns.length + 1} className="px-4 py-2">
                      <div className="h-4 bg-gray-800 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="py-16 text-center text-gray-500 text-sm">
                    {search ? `No items matching "${search}"` : 'No items in this dataset'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-600 text-xs font-mono sticky left-0 bg-gray-900/80 group-hover:bg-gray-800/80">
                      {offset + i + 1}
                    </td>
                    {columns.map(col => (
                      <td key={col} className="px-4 py-2.5 max-w-xs">
                        <CellValue value={row[col]} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between bg-gray-900/50">
          <p className="text-xs text-gray-500">
            {search
              ? `Filtered: ${filteredItems.length} of ${PAGE_SIZE} loaded`
              : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, totalItems)} of ${totalItems.toLocaleString()} items`
            }
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Page {currentPage} / {totalPages}</span>
            <Button
              size="sm" variant="secondary"
              disabled={offset === 0}
              onClick={() => { setOffset(Math.max(0, offset - PAGE_SIZE)); setSearch(''); }}
            >
              <ChevronLeft size={13} /> Prev
            </Button>
            <Button
              size="sm" variant="secondary"
              disabled={offset + PAGE_SIZE >= totalItems}
              onClick={() => { setOffset(offset + PAGE_SIZE); setSearch(''); }}
            >
              Next <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      </div>

      {/* Fields info */}
      {(ds.fields?.length ?? 0) > 0 && (
        <div className="mt-4 p-4 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-xs font-medium text-gray-500 mb-2">Detected Fields ({ds.fields.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {ds.fields.map((f: string) => (
              <span key={f} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded font-mono border border-gray-700">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
