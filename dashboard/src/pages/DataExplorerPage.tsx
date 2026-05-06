import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Download } from 'lucide-react';
import { datasetsApi, downloadProtectedFile } from '../api/client';
import ExportButton from '../components/ExportButton';
import { Button, EmptyState, PageHeader } from '../components/ui/StatusBadge';

export default function DataExplorerPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => datasetsApi.list(),
  });

  const datasets = data?.data || [];
  const selectedDataset = datasets.find((dataset: any) => dataset.id === selectedDatasetId) || datasets[0];

  useEffect(() => {
    if (!selectedDatasetId && datasets[0]?.id) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [datasets, selectedDatasetId]);

  const { data: previewData } = useQuery({
    queryKey: ['dataset-preview', selectedDataset?.id],
    queryFn: () => datasetsApi.getItems(selectedDataset.id, { limit: 5 }),
    enabled: Boolean(selectedDataset?.id),
  });

  const previewRows = previewData?.data || [];

  const handleDatasetDownload = async (datasetId: string, format: 'xls' | 'csv') => {
    const path = datasetsApi.exportUrl(datasetId, format);
    await downloadProtectedFile(path, `dataset-${datasetId}.${format}`);
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Data Explorer"
        description="Search, preview, filter, and export campaign datasets."
        actions={
          selectedDataset?.actor_id ? (
            <ExportButton
              campaignId={selectedDataset.actor_id}
              campaignName={selectedDataset.actor_name || selectedDataset.name || 'campaign'}
              columns={selectedDataset.fields || []}
              previewRows={previewRows}
            />
          ) : (
            <Button variant="primary" disabled><Download size={14} /> Export Current View</Button>
          )
        }
      />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden">
        <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-950/70 px-5 py-3 text-xs uppercase tracking-wide text-slate-500">
          <span>Name</span>
          <span>Campaign</span>
          <span>Items</span>
          <span>Fields</span>
          <span>Export</span>
        </div>
        {isLoading ? (
          <div className="p-5 text-sm text-slate-400">Loading datasets…</div>
        ) : !datasets.length ? (
          <EmptyState icon={Database} title="No datasets yet" description="Run a campaign to populate the data explorer." />
        ) : (
          <div>
            {datasets.map((dataset: any) => (
              <div
                key={dataset.id}
                onClick={() => setSelectedDatasetId(dataset.id)}
                className={`grid w-full grid-cols-5 items-center border-b border-slate-800 px-5 py-4 text-left text-sm text-slate-300 last:border-b-0 ${
                  selectedDataset?.id === dataset.id ? 'bg-cyan-500/8' : ''
                }`}
              >
                <span>{dataset.name || dataset.id.slice(0, 8)}</span>
                <span>{dataset.actor_name || 'Unknown campaign'}</span>
                <span>{dataset.item_count?.toLocaleString?.() || dataset.item_count}</span>
                <span className="truncate text-slate-500">{dataset.fields?.join(', ') || 'dynamic schema'}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDatasetDownload(dataset.id, 'xls');
                    }}
                    className="text-cyan-300 hover:text-cyan-200"
                  >
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDatasetDownload(dataset.id, 'csv');
                    }}
                    className="text-cyan-300 hover:text-cyan-200"
                  >
                    CSV
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedDataset && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Dataset Preview</h2>
              <p className="text-sm text-slate-400">{selectedDataset.actor_name || 'Campaign'} · {selectedDataset.item_count?.toLocaleString?.() || 0} records</p>
            </div>
            {selectedDataset.actor_id && (
              <ExportButton
                campaignId={selectedDataset.actor_id}
                campaignName={selectedDataset.actor_name || selectedDataset.name || 'campaign'}
                columns={selectedDataset.fields || []}
                previewRows={previewRows}
              />
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  {(selectedDataset.fields || []).map((field: string) => (
                    <th key={field} className="px-3 py-2 font-medium">{field}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row: any, index: number) => (
                  <tr key={index} className="border-b border-slate-900 text-slate-300">
                    {(selectedDataset.fields || []).map((field: string) => (
                      <td key={field} className="max-w-56 truncate px-3 py-2">{String(row[field] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
                {!previewRows.length && (
                  <tr>
                    <td className="px-3 py-6 text-slate-500" colSpan={Math.max((selectedDataset.fields || []).length, 1)}>
                      No preview rows available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
