import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play, Code2, Settings, History, Save, ExternalLink, Copy, CheckCircle,
} from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { scrapingApi } from '../api/client';
import {
  StatusBadge, Button, Modal, PageHeader,
} from '../components/ui/StatusBadge';

type Tab = 'overview' | 'code' | 'runs' | 'settings';

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

function RunModal({ campaign, isOpen, onClose }: {
  campaign: any; isOpen: boolean; onClose: () => void;
}) {
  const [inputJson, setInputJson] = useState(
    JSON.stringify(campaign?.input_schema?.example ?? {}, null, 2)
  );
  const [memoryMb, setMemoryMb] = useState(512);

  const queryClient = useQueryClient();

  const runMutation = useMutation({
    mutationFn: () =>
      scrapingApi.run(campaign.id, {
        input: JSON.parse(inputJson),
        memoryMb,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      onClose();
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Run: ${campaign?.name}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">Input JSON</label>
          <CodeEditor
            value={inputJson}
            onChange={setInputJson}
            language="json"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-2">Memory (MB)</label>
          <input
            type="number"
            value={memoryMb}
            onChange={(e) => setMemoryMb(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-900 text-white"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={runMutation.isPending}
            onClick={() => runMutation.mutate()}
          >
            <Play size={14} /> Start Run
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showRunModal, setShowRunModal] = useState(false);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => scrapingApi.detail(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="text-slate-400">Loading...</div>;
  }

  if (!campaign?.data) {
    return <div className="text-red-400">Campaign not found</div>;
  }

  const c = campaign.data;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title={c.name}
        description={c.description || 'No description'}
        actions={
          <Button
            variant="primary"
            onClick={() => setShowRunModal(true)}
          >
            <Play size={14} /> Run Campaign
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">Status</p>
          <StatusBadge status={c.status} />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">Runtime</p>
          <p className="text-lg font-semibold text-white">{c.runtime}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">Created</p>
          <p className="text-sm text-white">{format(parseISO(c.created_at), 'MMM dd, yyyy')}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">Updated</p>
          <p className="text-sm text-white">{formatDistanceToNow(parseISO(c.updated_at), { addSuffix: true })}</p>
        </div>
      </div>

      <div className="mt-6 border-b border-slate-800">
        <div className="flex gap-8">
          {(['overview', 'code', 'runs', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-cyan-500 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Description</h3>
              <p className="text-slate-300">{c.description || 'No description provided'}</p>
            </div>
          </div>
        )}

        {activeTab === 'code' && (
          <div className="space-y-4">
            <CodeEditor value={c.code || ''} readOnly />
          </div>
        )}

        {activeTab === 'runs' && (
          <div className="text-slate-400">View recent runs here</div>
        )}

        {activeTab === 'settings' && (
          <div className="text-slate-400">Settings coming soon</div>
        )}
      </div>

      <RunModal
        campaign={c}
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
      />
    </div>
  );
}
