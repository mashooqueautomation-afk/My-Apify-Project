import { useAuthStore } from '../store/auth';
import { PageHeader } from '../components/ui/StatusBadge';

export default function TeamPage() {
  const { user } = useAuthStore();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title="Team Collaboration" description="Manage members, roles, and shared operational accountability." />
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="font-medium text-white">{user?.name}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">{user?.role || 'admin'}</p>
        </div>
      </div>
    </div>
  );
}
