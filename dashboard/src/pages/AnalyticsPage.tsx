import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '../api/client';
import { PageHeader } from '../components/ui/StatusBadge';

export default function AnalyticsPage() {
  const { data: overview } = useQuery({ queryKey: ['analytics-overview'], queryFn: metricsApi.overview });

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Analytics" description="Track scrape volume, reliability, throughput, and platform ROI." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Scrapes today', overview?.runs?.total_runs || 0],
          ['Success rate', `${overview?.runs?.total_runs ? Math.round((overview.runs.successful_runs / overview.runs.total_runs) * 100) : 0}%`],
          ['Storage used', `${overview?.datasets?.total_datasets || 0} datasets`],
          ['Top targets', overview?.actors?.count || 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
