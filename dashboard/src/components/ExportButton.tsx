import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileJson, FileSpreadsheet, FileText, GripVertical } from 'lucide-react';
import { downloadProtectedFile, scrapingApi } from '../api/client';
import { Button, Modal } from './ui/StatusBadge';

type ExportFormat = 'excel' | 'csv' | 'json';
type ExportDestination = 'download' | 'email' | 'google-drive' | 'dropbox';

interface ExportButtonProps {
  campaignId: string;
  campaignName: string;
  columns?: string[];
  previewRows?: Record<string, unknown>[];
  defaultLimit?: number;
}

const formatIcons = {
  excel: FileSpreadsheet,
  csv: FileText,
  json: FileJson,
};

function estimateBytes(rowCount: number, columnCount: number, format: ExportFormat) {
  const rough = rowCount * Math.max(columnCount, 1) * (format === 'excel' ? 28 : format === 'csv' ? 14 : 22);
  if (rough > 1024 * 1024) return `${(rough / (1024 * 1024)).toFixed(1)} MB`;
  if (rough > 1024) return `${Math.ceil(rough / 1024)} KB`;
  return `${rough} B`;
}

export default function ExportButton({
  campaignId,
  campaignName,
  columns = [],
  previewRows = [],
  defaultLimit = 10000,
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [includeMeta, setIncludeMeta] = useState(true);
  const [filterApply, setFilterApply] = useState(true);
  const [limit, setLimit] = useState(defaultLimit);
  const [destination, setDestination] = useState<ExportDestination>('download');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(columns);
  const [isDownloading, setIsDownloading] = useState(false);

  const activeColumns = selectedColumns.length ? selectedColumns : columns;
  const fileName = `${campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xls' : format}`;
  const preview = useMemo(() => previewRows.slice(0, 5), [previewRows]);

  const toggleColumn = (column: string) => {
    setSelectedColumns((current) =>
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column]
    );
  };

  const moveColumn = (column: string, direction: -1 | 1) => {
    setSelectedColumns((current) => {
      const source = current.length ? [...current] : [...columns];
      const index = source.indexOf(column);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= source.length) return source;
      [source[index], source[nextIndex]] = [source[nextIndex], source[index]];
      return source;
    });
  };

  const handleDownload = async () => {
    if (destination !== 'download') return;
    setIsDownloading(true);
    try {
      const href = scrapingApi.exportUrl(campaignId, {
        format,
        includeMeta,
        filterApply,
        columns: activeColumns,
        limit,
      });
      await downloadProtectedFile(href, fileName);
      setIsOpen(false);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <Button variant="primary" onClick={() => setIsOpen(true)}>
        <Download size={14} /> Export
      </Button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={`Export ${campaignName}`}>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {(['excel', 'csv', 'json'] as ExportFormat[]).map((option) => {
              const Icon = formatIcons[option];
              const active = format === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormat(option)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} />
                    <span className="font-medium capitalize">{option}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {option === 'excel' ? 'Multi-sheet export with formatting.' : option === 'csv' ? 'Lightweight tabular export.' : 'Raw structured payload.'}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-white">Columns</p>
                <button type="button" className="text-xs text-cyan-300" onClick={() => setSelectedColumns(columns)}>Select all</button>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {(selectedColumns.length ? selectedColumns : columns).map((column) => (
                  <div key={column} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <GripVertical size={14} className="text-slate-500" />
                    <input
                      checked={activeColumns.includes(column)}
                      onChange={() => toggleColumn(column)}
                      type="checkbox"
                      className="rounded border-slate-600 bg-slate-900 text-cyan-400"
                    />
                    <span className="flex-1 truncate text-sm text-slate-200">{column}</span>
                    <button type="button" onClick={() => moveColumn(column, -1)} className="text-slate-500 hover:text-white">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" onClick={() => moveColumn(column, 1)} className="text-slate-500 hover:text-white">
                      <ArrowDown size={14} />
                    </button>
                  </div>
                ))}
                {!columns.length && <p className="text-sm text-slate-500">Run the campaign first to discover export columns.</p>}
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Limit</label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={limit}
                  onChange={(event) => setLimit(Math.min(100000, Math.max(1, Number(event.target.value) || 1)))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Destination</label>
                <select
                  value={destination}
                  onChange={(event) => setDestination(event.target.value as ExportDestination)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="download">Download now</option>
                  <option value="email">Email (coming soon)</option>
                  <option value="google-drive">Google Drive (coming soon)</option>
                  <option value="dropbox">Dropbox (coming soon)</option>
                </select>
              </div>

              <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
                <span>Include metadata sheet</span>
                <input type="checkbox" checked={includeMeta} onChange={() => setIncludeMeta((value) => !value)} />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">
                <span>Apply current filters</span>
                <input type="checkbox" checked={filterApply} onChange={() => setFilterApply((value) => !value)} />
              </label>

              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm">
                <p className="font-medium text-cyan-200">Export summary</p>
                <p className="mt-2 text-slate-300">{fileName}</p>
                <p className="mt-1 text-slate-400">Estimated size: {estimateBytes(limit, activeColumns.length || columns.length, format)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">Preview</p>
              <p className="text-xs text-slate-500">First 5 rows</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-slate-800">
                    {activeColumns.map((column) => (
                      <th key={column} className="px-3 py-2 font-medium text-slate-500">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, index) => (
                    <tr key={index} className="border-b border-slate-900">
                      {activeColumns.map((column) => (
                        <td key={column} className="max-w-48 truncate px-3 py-2">{String(row[column] ?? '—')}</td>
                      ))}
                    </tr>
                  ))}
                  {!preview.length && (
                    <tr>
                      <td className="px-3 py-6 text-slate-500" colSpan={Math.max(activeColumns.length, 1)}>
                        No sample rows yet. Run the campaign to preview export data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Recent exports and cloud destinations can be added on top of this modal without changing the API contract.</p>
            <Button onClick={handleDownload} loading={isDownloading} disabled={destination !== 'download' || !campaignId}>
              <Download size={14} /> Download
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
