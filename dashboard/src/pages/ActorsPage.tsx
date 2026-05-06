import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus, Play, Trash2, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { actorsApi } from '../api/client';
import { StatusBadge, Button, Modal, Input, EmptyState, PageHeader } from '../components/ui/StatusBadge';

const RUNTIMES = [
  { value: 'node18',     label: 'Node.js 18' },
  { value: 'playwright', label: 'Playwright (Browser)' },
  { value: 'python310',  label: 'Python 3.10' },
];

const ACTOR_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
];

function CreateActorModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '', description: '', runtime: 'node18',
    status: 'active', isPublic: false, sourceCode: DEFAULT_SOURCE,
  });

  const mutation = useMutation({
    mutationFn: actorsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actors'] });
      onClose();
      setForm({ name: '', description: '', runtime: 'node18', status: 'active', isPublic: false, sourceCode: DEFAULT_SOURCE });
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Actor">
      <div className="space-y-4">
        <Input
          label="Actor Name"
          placeholder="my-web-scraper"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
        <Input
          label="Description"
          placeholder="What does this actor do?"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
        <div>
          <label className="text-sm font-medium text-gray-300 block mb-1.5">Runtime</label>
          <select
            value={form.runtime}
            onChange={e => setForm(f => ({ ...f, runtime: e.target.value }))}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {RUNTIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-300 block mb-1.5">Initial Status</label>
          <select
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ACTOR_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-300 block mb-1.5">Source Code</label>
          <textarea
            value={form.sourceCode}
            onChange={e => setForm(f => ({ ...f, sourceCode: e.target.value }))}
            rows={8}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-green-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        {mutation.error && (
          <p className="text-sm text-red-400">{(mutation.error as any)?.response?.data?.error?.message || 'Failed'}</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={() => mutation.mutate(form)}
            disabled={!form.name}
          >
            Create Actor
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RunActorModal({ actor, isOpen, onClose }: { actor: any; isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [inputJson, setInputJson] = useState('{}');
  const [jsonError, setJsonError] = useState('');

  const mutation = useMutation({
    mutationFn: ({ input }: { input: any }) => actorsApi.run(actor.id, input),
    onSuccess: (run) => {
      onClose();
      navigate(`/runs/${run.id}`);
    },
  });

  const handleRun = () => {
    try {
      const input = JSON.parse(inputJson);
      setJsonError('');
      mutation.mutate({ input });
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Run: ${actor?.name}`}>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-300 block mb-1.5">Input (JSON)</label>
          <textarea
            value={inputJson}
            onChange={e => { setInputJson(e.target.value); setJsonError(''); }}
            rows={6}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-green-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {jsonError && <p className="text-xs text-red-400 mt-1">{jsonError}</p>}
        </div>
        {mutation.error && (
          <p className="text-sm text-red-400">{(mutation.error as any)?.response?.data?.error?.message || 'Failed to start run'}</p>
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

export default function ActorsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [runTarget, setRunTarget] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['actors'],
    queryFn: () => actorsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: actorsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actors'] }),
  });

  const actors = data?.data || [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Actors"
        description="Automated scraping and data extraction bots"
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Actor
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : actors.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No actors yet"
          description="Create your first actor to start scraping data"
          action={<Button variant="primary" onClick={() => setShowCreate(true)}><Plus size={14} />Create Actor</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {actors.map((actor: any) => (
            <div key={actor.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                    <Bot size={17} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white text-sm leading-tight">{actor.name}</h3>
                    <p className="text-xs text-gray-500">{actor.runtime}</p>
                  </div>
                </div>
                <StatusBadge status={actor.status} />
              </div>

              {actor.description && (
                <p className="text-xs text-gray-400 mb-3 line-clamp-2">{actor.description}</p>
              )}

              <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
                <span>{actor.total_runs} runs</span>
                {actor.avg_duration_secs && <span>~{actor.avg_duration_secs}s avg</span>}
                <span>{format(parseISO(actor.created_at), 'MMM dd')}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={() => setRunTarget(actor)}>
                  <Play size={12} /> Run
                </Button>
                <a href={`/actors/${actor.id}`}>
                  <Button size="sm" variant="secondary">
                    <ExternalLink size={12} /> Details
                  </Button>
                </a>
                <Button
                  size="sm" variant="ghost"
                  className="ml-auto text-red-500 hover:text-red-400"
                  onClick={() => { if (confirm('Delete actor?')) deleteMutation.mutate(actor.id); }}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateActorModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      {runTarget && (
        <RunActorModal actor={runTarget} isOpen={!!runTarget} onClose={() => setRunTarget(null)} />
      )}
    </div>
  );
}

const DEFAULT_SOURCE = `const { Actor } = require('./actor-sdk/index');

Actor.main(async () => {
  const input = await Actor.getInput();
  const { url = 'https://example.com' } = input;

  Actor.log.info('Fetching:', url);
  const resp = await fetch(url);
  const html = await resp.text();

  const dataset = await Actor.openDataset();
  await dataset.pushData({
    url,
    title: html.match(/<title>([^<]*)<\\/title>/i)?.[1] || 'N/A',
    length: html.length,
    scrapedAt: new Date().toISOString(),
  });

  Actor.log.info('Done!');
});
`;
