import { Link } from 'react-router-dom';
import { ArrowRight, Database, ShieldCheck, Workflow, FileSpreadsheet, Activity } from 'lucide-react';

const FEATURES = [
  { icon: Database, title: 'Production lead scraping', text: 'Run structured scraping campaigns for products, companies, jobs, and news at scale.' },
  { icon: FileSpreadsheet, title: 'Excel-ready exports', text: 'Export campaign data into analyst-friendly Excel, CSV, and JSON deliverables.' },
  { icon: Workflow, title: 'N8N automation', text: 'Trigger campaigns, receive signed webhooks, and move data into downstream workflows.' },
  { icon: ShieldCheck, title: 'Enterprise controls', text: 'API keys, scoped access, webhook signing, and operational auditability.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/15 text-cyan-300">
              <Activity size={20} />
            </div>
            <div>
              <p className="font-semibold text-white">Mash Lead Scrapping</p>
              <p className="text-xs text-slate-500">Enterprise scraping automation</p>
            </div>
          </div>
          <Link to="/login" className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
            Sign in
          </Link>
        </div>

        <section className="grid gap-10 py-20 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-cyan-300">AI-Powered Lead Scraping</p>
            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white">
              Mash Lead Scrapping turns real-world websites into sales-ready datasets and automated workflows.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-slate-400">
              Launch campaigns, monitor runs, export analyst-grade Excel files, and connect every scrape to N8N and your downstream systems.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/login" className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 font-medium text-slate-950 hover:bg-cyan-400">
                Start Free Trial <ArrowRight size={16} />
              </Link>
              <Link to="/api-docs" className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800">
                Explore API
              </Link>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                ['98.5%', 'average data quality'],
                ['100K', 'rows per export'],
                ['3', 'N8N workflow templates'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <p className="text-2xl font-semibold text-white">{value}</p>
                  <p className="mt-1 text-sm text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-950/20">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Live campaign snapshot</p>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">Running</span>
              </div>
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs uppercase text-slate-500">Campaign</p>
                  <p className="mt-1 text-white">Amazon price monitoring</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-xs uppercase text-slate-500">Records</p>
                    <p className="mt-1 text-2xl font-semibold text-white">1,500</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-xs uppercase text-slate-500">Success rate</p>
                    <p className="mt-1 text-2xl font-semibold text-white">98.5%</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <p className="mb-2 text-xs uppercase text-slate-500">Automation</p>
                  <p className="text-sm text-slate-300">Webhook signed and sent to N8N. Excel export uploaded to Google Drive.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-20 md:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                <Icon size={18} />
              </div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm text-slate-400">{text}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
