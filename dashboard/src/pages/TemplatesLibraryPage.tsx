import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeDollarSign,
  Briefcase,
  Globe,
  MapPinned,
  Newspaper,
  Search,
  ShoppingCart,
  Sparkles,
  Star,
} from 'lucide-react';
import { storeApi } from '../api/client';
import { Button, EmptyState, PageHeader } from '../components/ui/StatusBadge';

const CATEGORY_LABELS: Record<string, string> = {
  'lead-generation': 'Lead Gen',
  ecommerce: 'E-Commerce',
  'maps-local': 'Maps & Local',
  'news-content': 'News & Content',
  'web-crawling': 'Web Crawling',
};

const ICONS: Record<string, any> = {
  Briefcase,
  ShoppingCart,
  MapPinned,
  Newspaper,
  Globe,
};

function StoreAppCard({ app, onInstall, installing }: { app: any; onInstall: (slug: string, name: string) => void; installing: boolean }) {
  const Icon = ICONS[app.icon] || Sparkles;

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
            <Icon size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{app.name}</h2>
              {app.featured && <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300">Featured</span>}
            </div>
            <p className="mt-1 text-sm text-slate-400">{app.tagline}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-amber-300">
            <Star size={14} className="fill-current" />
            <span className="text-sm font-medium">{app.rating.toFixed(1)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{app.installs.toLocaleString()} installs</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-300">{app.description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {[CATEGORY_LABELS[app.category], ...app.targets.slice(0, 2), ...app.tags.slice(0, 2)].filter(Boolean).map((chip) => (
          <span key={chip} className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs text-slate-400">
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Use Cases</p>
          <div className="mt-3 space-y-2">
            {app.useCases.map((useCase: string) => (
              <div key={useCase} className="text-sm text-slate-300">{useCase}</div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Runtime</p>
          <p className="mt-2 text-sm font-medium text-white">{app.runtime}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.25em] text-slate-500">Memory / Timeout</p>
          <p className="mt-2 text-sm text-slate-300">{app.defaultRunOptions.memoryMbytes} MB / {app.defaultRunOptions.timeoutSecs}s</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Default Input</p>
          <pre className="mt-2 max-w-2xl overflow-x-auto text-xs text-cyan-300">{JSON.stringify(app.defaultInput, null, 2)}</pre>
        </div>
        <Button variant="primary" loading={installing} onClick={() => onInstall(app.slug, app.name)}>
          Install App
        </Button>
      </div>
    </div>
  );
}

export default function TemplatesLibraryPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['store-apps'],
    queryFn: () => storeApi.listApps(),
  });

  const apps = data?.data || [];
  const meta = data?.meta;
  const categories = useMemo(
    () => ['', ...(meta?.categories || [])],
    [meta?.categories]
  );

  const filteredApps = useMemo(() => {
    return apps.filter((app: any) => {
      const matchesCategory = !category || app.category === category;
      const term = search.trim().toLowerCase();
      const haystack = [
        app.name,
        app.tagline,
        app.description,
        ...(app.tags || []),
        ...(app.targets || []),
      ].join(' ').toLowerCase();
      return matchesCategory && (!term || haystack.includes(term));
    });
  }, [apps, category, search]);

  const installMutation = useMutation({
    mutationFn: ({ slug, name }: { slug: string; name: string }) => storeApi.installApp(slug, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actors'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Mash Store"
        description="Install production-ready scraping apps for lead generation, local search, e-commerce monitoring, content intelligence, and custom crawling."
        actions={
          <div className="hidden items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 md:flex">
            <BadgeDollarSign size={15} />
            {apps.length} installable apps
          </div>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_220px_220px]">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
          <Search size={16} className="text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search apps, targets, or use cases"
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300 focus:outline-none"
        >
          {categories.map((value) => (
            <option key={value || 'all'} value={value}>
              {value ? CATEGORY_LABELS[value] || value : 'All categories'}
            </option>
          ))}
        </select>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-400">
          Featured apps: {apps.filter((app: any) => app.featured).length}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-72 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/70" />
          ))}
        </div>
      ) : filteredApps.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No apps matched your filters"
          description="Try another category or broaden the search term."
        />
      ) : (
        <div className="grid gap-5">
          {filteredApps.map((app: any) => (
            <StoreAppCard
              key={app.slug}
              app={app}
              installing={installMutation.isPending && installMutation.variables?.slug === app.slug}
              onInstall={(slug, name) => installMutation.mutate({ slug, name })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
