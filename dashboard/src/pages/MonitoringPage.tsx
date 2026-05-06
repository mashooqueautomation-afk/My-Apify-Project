import { useQuery } from '@tanstack/react-query';
import { Activity, Square } from 'lucide-react';
import { runsApi } from '../api/client';
import { Button, PageHeader, StatusBadge } from '../components/ui/StatusBadge';

export default function MonitoringPage() {
  const { data } = useQuery({
    queryKey: ['runs', 'monitoring'],
    queryFn: () => runsApi.list({ limit: 12, status: 'running' }),
    refetchInterval: 5000,
  });

  const runs = data?.data || [];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Real-Time Monitoring" description="Observe active scraping runs, throughput, and live operational health." />
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Active scrapes</h2>
            <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs text-cyan-300">{runs.length} live</span>
          </div>
          <div className="space-y-4">
            {runs.length ? runs.map((run: any) => (
              <div key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">{run.actor_name}</p>
                    <p className="text-xs text-slate-500">{run.id}</p>
                  </div>
                  <StatusBadge status={run.status} />
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full w-3/4 rounded-full bg-cyan-400" />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Estimated completion: ~2m</span>
                  <Button size="sm" variant="ghost"><Square size={12} /> Abort</Button>
                </div>
              </div>
            )) : (
              <p className="text-sm text-slate-500">No active runs right now.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 font-mono text-sm text-emerald-300">
          <div className="mb-4 flex items-center gap-2 text-white"><Activity size={16} /> Live log stream</div>
          <div className="space-y-2 text-xs leading-6">
            <p>[15:30:00] Campaign queued: amazon-price-monitor</p>
            <p>[15:30:03] Browser pool initialized with stealth profile</p>
            <p>[15:30:12] Page 1 scraped: 50 products</p>
            <p>[15:30:24] Export buffer prepared for downstream workflow</p>
            <p>[15:30:29] Signed webhook sent to n8n endpoint</p>
          </div>
        </div>
      </div>
    </div>
  );
}
