import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Search, Database, Settings, LogOut, Zap,
  Workflow, Activity, BookOpenText, BarChart3, Library, Webhook,
  Users, LifeBuoy, CreditCard, BellRing, KeyRound,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/campaigns', icon: Search,          label: 'Campaigns' },
  { to: '/data-explorer', icon: Database,    label: 'Data Explorer' },
  { to: '/monitoring', icon: Activity,       label: 'Monitoring' },
  { to: '/integrations', icon: Workflow,     label: 'N8N Integrations' },
  { to: '/analytics', icon: BarChart3,       label: 'Analytics' },
  { to: '/templates', icon: Library,         label: 'Templates' },
  { to: '/webhook-history', icon: Webhook,   label: 'Webhook History' },
  { to: '/team', icon: Users,                label: 'Team' },
  { to: '/api-docs', icon: BookOpenText,     label: 'API Docs' },
  { to: '/billing', icon: CreditCard,        label: 'Billing' },
  { to: '/help', icon: LifeBuoy,             label: 'Help' },
  { to: '/settings', icon: Settings,         label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-72 bg-slate-950/95 border-r border-slate-800 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="h-20 flex items-center px-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500/15 rounded-2xl border border-cyan-500/20 flex items-center justify-center">
              <Zap size={18} className="text-cyan-300" />
            </div>
            <div>
              <p className="font-semibold text-white tracking-tight leading-none">Mash Lead Scrapping</p>
              <p className="text-xs text-slate-500 mt-1">Enterprise lead automation</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors group ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} className={isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300'} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="border-t border-slate-800 p-4">
          <div className="panel p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-cyan-500/15 border border-cyan-500/20 text-cyan-200 flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Operations Console</p>
              <h1 className="text-sm text-slate-300">Lead scraping, exports, and workflow orchestration</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-400">
                <Search size={15} />
                Search campaigns, datasets, docs
              </div>
              <button className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white">
                <BellRing size={16} />
              </button>
              <button className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white">
                <KeyRound size={16} />
              </button>
            </div>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
