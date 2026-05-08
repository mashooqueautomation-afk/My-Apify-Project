// dashboard/src/components/layout/Layout.tsx

import { useState, useRef, useEffect } from 'react';

import { Outlet, NavLink, useNavigate } from 'react-router-dom';

import {
  LayoutDashboard,
  Search,
  Database,
  Settings,
  LogOut,
  Zap,
  Workflow,
  Activity,
  BookOpenText,
  BarChart3,
  Library,
  Webhook,
  Users,
  LifeBuoy,
  CreditCard,
  BellRing,
  KeyRound,
} from 'lucide-react';

import { useAuthStore } from '../../store/auth';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/campaigns', icon: Search, label: 'Campaigns' },
  { to: '/data-explorer', icon: Database, label: 'Data Explorer' },
  { to: '/monitoring', icon: Activity, label: 'Monitoring' },
  { to: '/integrations', icon: Workflow, label: 'N8N Integrations' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/templates', icon: Library, label: 'Templates' },
  { to: '/webhook-history', icon: Webhook, label: 'Webhook History' },
  { to: '/team', icon: Users, label: 'Team' },
  { to: '/api-docs', icon: BookOpenText, label: 'API Docs' },
  { to: '/billing', icon: CreditCard, label: 'Billing' },
  { to: '/help', icon: LifeBuoy, label: 'Help' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();

  const navigate = useNavigate();

  const [showNotifications, setShowNotifications] =
    useState(false);

  const [showKeys, setShowKeys] =
    useState(false);

  const notificationRef =
    useRef<HTMLDivElement>(null);

  const keyRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (
      event: MouseEvent
    ) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(
          event.target as Node
        )
      ) {
        setShowNotifications(false);
      }

      if (
        keyRef.current &&
        !keyRef.current.contains(
          event.target as Node
        )
      ) {
        setShowKeys(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSearch = (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    const formData = new FormData(
      e.currentTarget
    );

    const query = formData
      .get('search')
      ?.toString()
      ?.trim();

    if (!query) return;

    navigate(
      `/campaigns?search=${encodeURIComponent(
        query
      )}`
    );
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-950/95 border-r border-slate-800 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="h-20 flex items-center px-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500/15 rounded-2xl border border-cyan-500/20 flex items-center justify-center">
              <Zap
                size={18}
                className="text-cyan-300"
              />
            </div>

            <div>
              <p className="font-semibold text-white tracking-tight leading-none">
                Mash Lead Scrapping
              </p>

              <p className="text-xs text-slate-500 mt-1">
                Enterprise lead automation
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(
            ({ to, icon: Icon, label }) => (
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
                    <Icon
                      size={17}
                      className={
                        isActive
                          ? 'text-cyan-300'
                          : 'text-slate-500 group-hover:text-slate-300'
                      }
                    />

                    {label}
                  </>
                )}
              </NavLink>
            )
          )}
        </nav>

        {/* User */}
        <div className="border-t border-slate-800 p-4">
          <div className="panel p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-cyan-500/15 border border-cyan-500/20 text-cyan-200 flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() ||
                'U'}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.name}
              </p>

              <p className="text-xs text-slate-500 truncate">
                {user?.email}
              </p>
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

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Operations Console
              </p>

              <h1 className="text-sm text-slate-300">
                Lead scraping, exports, and workflow
                orchestration
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* SEARCH */}
              <form
                onSubmit={handleSearch}
                className="hidden md:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-400"
              >
                <Search size={15} />

                <input
                  name="search"
                  type="text"
                  placeholder="Search campaigns, datasets, docs"
                  className="bg-transparent outline-none text-slate-200 placeholder:text-slate-500 w-64"
                />
              </form>

              {/* NOTIFICATIONS */}
              <div
                className="relative"
                ref={notificationRef}
              >
                <button
                  onClick={() =>
                    setShowNotifications(
                      !showNotifications
                    )
                  }
                  className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white"
                >
                  <BellRing size={16} />
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden z-50">
                    <div className="border-b border-slate-800 px-4 py-3">
                      <h3 className="font-semibold text-white">
                        Notifications
                      </h3>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                        <p className="text-sm text-white">
                          Actor run completed
                        </p>

                        <p className="text-xs text-slate-500 mt-1">
                          LinkedIn Scraper finished
                          successfully.
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                        <p className="text-sm text-white">
                          Export generated
                        </p>

                        <p className="text-xs text-slate-500 mt-1">
                          CSV export is ready to
                          download.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* API KEYS */}
              <div
                className="relative"
                ref={keyRef}
              >
                <button
                  onClick={() =>
                    setShowKeys(!showKeys)
                  }
                  className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white"
                >
                  <KeyRound size={16} />
                </button>

                {showKeys && (
                  <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden z-50">
                    <div className="border-b border-slate-800 px-4 py-3">
                      <h3 className="font-semibold text-white">
                        API Access
                      </h3>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                        <p className="text-xs text-slate-500">
                          Active API Key
                        </p>

                        <p className="mt-1 font-mono text-sm text-cyan-300">
                          mash_live_x8h29s...
                        </p>
                      </div>

                      <button className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 transition">
                        Generate New Key
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}