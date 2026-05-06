import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import {
  Play, CheckCircle, XCircle, Clock, Database,
  Bot, TrendingUp, Zap, AlertCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { metricsApi, runsApi } from '../api/client';
import { StatusBadge, statColor } from '../components/ui/StatusBadge';

function StatCard({
  icon: Icon, label, value, sub, color = 'blue',
}: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-500/10 text-blue-400',
    green:  'bg-green-500/10 text-green-400',
    red:    'bg-red-500/10 text-red-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    purple: 'bg-purple-500/10 text-purple-400',
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${colors[color]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['metrics', 'overview'],
    queryFn: metricsApi.overview,
    refetchInterval: 30_000,
  });

  const { data: daily } = useQuery({
    queryKey: ['metrics', 'daily'],
    queryFn: () => metricsApi.daily(14),
  });

  const { data: recentRuns } = useQuery({
    queryKey: ['runs', 'recent'],
    queryFn: () => runsApi.list({ limit: 8 }),
    refetchInterval: 15_000,
  });

  const chartData = (daily || []).map((d: any) => ({
    date: format(parseISO(d.date), 'MMM dd'),
    succeeded: parseInt(d.succeeded || '0'),
    failed:    parseInt(d.failed || '0'),
    total:     parseInt(d.total || '0'),
  }));

  const successRate = overview?.runs?.total_runs > 0
    ? Math.round((overview.runs.successful_runs / overview.runs.total_runs) * 100)
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Operations Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Mash Lead Scrapping platform overview and real-time metrics</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Play} label="Total Runs" color="blue"
          value={overview?.runs?.total_runs ?? '—'}
          sub={`${overview?.runs?.active_runs ?? 0} active now`}
        />
        <StatCard
          icon={CheckCircle} label="Success Rate" color="green"
          value={`${successRate}%`}
          sub={`${overview?.runs?.successful_runs ?? 0} succeeded`}
        />
        <StatCard
          icon={Bot} label="Active Actors" color="purple"
          value={overview?.actors?.count ?? '—'}
        />
        <StatCard
          icon={Database} label="Dataset Items" color="yellow"
          value={parseInt(overview?.datasets?.total_items || '0').toLocaleString()}
          sub={`${overview?.datasets?.total_datasets ?? 0} datasets`}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Run volume */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Run Volume (14 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Area type="monotone" dataKey="succeeded" stroke="#22c55e" fill="#22c55e20" strokeWidth={2} name="Succeeded" />
              <Area type="monotone" dataKey="failed"    stroke="#ef4444" fill="#ef444420" strokeWidth={2} name="Failed" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Success vs fail bar */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Success vs Failures</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              <Bar dataKey="succeeded" fill="#22c55e" name="Succeeded" radius={[3,3,0,0]} />
              <Bar dataKey="failed"    fill="#ef4444" name="Failed"    radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Runs table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent Runs</h3>
          <a href="/runs" className="text-xs text-blue-400 hover:text-blue-300">View all →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Actor', 'Status', 'Duration', 'Items', 'Started'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {(recentRuns?.data || []).map((run: any) => (
                <tr key={run.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3">
                    <a href={`/campaigns/${run.actor_id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                      {run.actor_name}
                    </a>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {run.duration_secs ? `${run.duration_secs}s` : '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {run.stats?.items_scraped?.toLocaleString() || '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {run.created_at ? format(parseISO(run.created_at), 'MMM dd, HH:mm') : '—'}
                  </td>
                </tr>
              ))}
              {!recentRuns?.data?.length && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-500 text-sm">
                    No runs yet. Create a campaign and run it.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
