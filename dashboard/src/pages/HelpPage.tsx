import { PageHeader } from '../components/ui/StatusBadge';

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title="Help & Documentation" description="Operator guides, troubleshooting, onboarding, and support resources." />
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ['Getting started', 'Launch your first campaign, run a scrape, and export results.'],
          ['N8N setup', 'Connect API keys, signed webhooks, and workflow templates.'],
          ['Troubleshooting', 'Handle rate limits, login expiry, and dataset issues.'],
          ['Keyboard shortcuts', 'Cmd+K search, quick navigation, and operator ergonomics.'],
        ].map(([title, text]) => (
          <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm text-slate-400">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
