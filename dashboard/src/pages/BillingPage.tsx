import { PageHeader } from '../components/ui/StatusBadge';

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title="Billing & Usage" description="Track plan limits, storage usage, and operational cost visibility." />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Current plan', 'Enterprise Trial'],
          ['Lead rows used', '12,450 / 100,000'],
          ['Storage used', '3.4 GB / 50 GB'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
