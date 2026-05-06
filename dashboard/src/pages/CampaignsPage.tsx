import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Play, Search } from 'lucide-react';
import { scrapingApi } from '../api/client';
import { Button, EmptyState, PageHeader, StatusBadge } from '../components/ui/StatusBadge';

export default function CampaignsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => scrapingApi.list(),
  });

  const campaigns = data?.data || [];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Scraping Campaigns"
        description="Manage production scraping workflows, schedules, exports, and automation hooks."
        actions={<Button variant="primary"><Plus size={14} /> New Campaign</Button>}
      />

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_220px_220px]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-400">
          Search campaigns, target sites, or descriptions
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-400">Status: All</div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-400">Date range: 30 days</div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState icon={Search} title="No campaigns yet" description="Create your first lead scraping campaign to populate this workspace." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign: any) => (
            <div key={campaign.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{campaign.runtime}</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">{campaign.name}</h2>
                </div>
                <StatusBadge status={campaign.status} />
              </div>
              <p className="mt-3 min-h-[44px] text-sm text-slate-400">{campaign.description || 'No campaign description yet.'}</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                  <p className="text-slate-500">Runs</p>
                  <p className="mt-1 font-semibold text-white">{campaign.total_runs}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                  <p className="text-slate-500">Success</p>
                  <p className="mt-1 font-semibold text-white">{campaign.success_runs}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                  <p className="text-slate-500">Avg sec</p>
                  <p className="mt-1 font-semibold text-white">{campaign.avg_duration_secs || '—'}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <Link to={`/campaigns/${campaign.id}`} className="inline-flex items-center rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400">
                  Open
                </Link>
                <Button variant="secondary" size="sm"><Play size={12} /> Run</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
