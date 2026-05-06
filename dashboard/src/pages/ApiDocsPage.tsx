import { PageHeader } from '../components/ui/StatusBadge';

const snippets = {
  curl: `curl -X POST https://api.mash-lead-scrapping.com/api/v1/scraping/CAMPAIGN_ID/run \\
  -H "Authorization: Bearer mash_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"input":{"query":"gaming laptop"},"options":{"timeoutSecs":3600}}'`,
  node: `import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.mash-lead-scrapping.com/api/v1',
  headers: { Authorization: 'Bearer mash_live_xxx' },
});

const run = await client.post('/scraping/CAMPAIGN_ID/run', {
  input: { query: 'gaming laptop' },
  options: { timeoutSecs: 3600 }
});`,
};

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="API Documentation" description="Authentication, scraping endpoints, exports, webhooks, and automation examples." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <h2 className="text-lg font-semibold text-white">Core endpoints</h2>
          <div className="mt-4 space-y-4 text-sm text-slate-300">
            <div><code className="text-cyan-300">POST /api/v1/scraping/:campaignId/run</code><p className="mt-1 text-slate-500">Trigger a scraping campaign.</p></div>
            <div><code className="text-cyan-300">GET /api/v1/scraping/:campaignId/runs/:runId</code><p className="mt-1 text-slate-500">Fetch run status, progress, and storage references.</p></div>
            <div><code className="text-cyan-300">GET /api/v1/scraping/:campaignId/export</code><p className="mt-1 text-slate-500">Download Excel, CSV, or JSON exports.</p></div>
            <div><code className="text-cyan-300">POST /api/v1/webhooks/test</code><p className="mt-1 text-slate-500">Send a signed test payload to your workflow endpoint.</p></div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
          <h2 className="text-lg font-semibold text-white">cURL example</h2>
          <pre className="mt-4 overflow-auto text-xs text-cyan-300">{snippets.curl}</pre>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-white">Node.js example</h2>
          <pre className="mt-4 overflow-auto text-xs text-cyan-300">{snippets.node}</pre>
        </div>
      </div>
    </div>
  );
}
