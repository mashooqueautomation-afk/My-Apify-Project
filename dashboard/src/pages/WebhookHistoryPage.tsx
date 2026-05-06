import { useQuery } from '@tanstack/react-query';
import { PageHeader, StatusBadge } from '../components/ui/StatusBadge';
import { webhooksApi } from '../api/client';

export default function WebhookHistoryPage() {
  const { data } = useQuery({ queryKey: ['webhook-history'], queryFn: webhooksApi.history });
  const rows = data || [];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Webhook History" description="Inspect recent signed webhook deliveries and replay operational failures." />
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden">
        <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-950/70 px-5 py-3 text-xs uppercase tracking-wide text-slate-500">
          <span>Event</span>
          <span>Target</span>
          <span>Status</span>
          <span>Created</span>
          <span>Response</span>
        </div>
        {rows.length ? rows.map((row: any) => (
          <div key={row.id} className="grid grid-cols-5 items-center border-b border-slate-800 px-5 py-4 text-sm text-slate-300 last:border-b-0">
            <span>{row.event}</span>
            <span className="truncate">{row.target_url}</span>
            <span><StatusBadge status={row.success ? 'succeeded' : 'failed'} /></span>
            <span>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</span>
            <span>{row.response_status || '—'}</span>
          </div>
        )) : (
          <div className="p-5 text-sm text-slate-500">No webhook delivery logs yet.</div>
        )}
      </div>
    </div>
  );
}
