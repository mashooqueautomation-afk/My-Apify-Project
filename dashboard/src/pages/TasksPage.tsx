import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, Plus, Play, Pause, Trash2, Clock,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { tasksApi, actorsApi } from '../api/client';
import {
  Button, Modal, Input, EmptyState, PageHeader,
} from '../components/ui/StatusBadge';

const CRON_PRESETS = [
  { label: 'Every 15 minutes',  value: '*/15 * * * *' },
  { label: 'Every hour',        value: '0 * * * *' },
  { label: 'Every 6 hours',     value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 9am',      value: '0 9 * * *' },
  { label: 'Weekdays at 9am',   value: '0 9 * * 1-5' },
  { label: 'Every Sunday',      value: '0 0 * * 0' },
  { label: 'Custom…',           value: '__custom__' },
];

function cronToHuman(expr: string): string {
  if (!expr) return '—';
  const found = CRON_PRESETS.find(p => p.value === expr);
  return found ? found.label : expr;
}

function TaskModal({ isOpen, onClose, editTask }: {
  isOpen: boolean; onClose: () => void; editTask?: any;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!editTask;
  const [form, setForm] = useState({
    actorId:   editTask?.actor_id  ?? '',
    name:      editTask?.name      ?? '',
    cronExpr:  editTask?.cron_expr ?? '0 9 * * *',
    timezone:  editTask?.timezone  ?? 'UTC',
    inputJson: JSON.stringify(editTask?.input ?? {}, null, 2),
  });
  const [isCustomCron, setIsCustomCron] = useState(
    !!editTask?.cron_expr && !CRON_PRESETS.some(p => p.value === editTask.cron_expr)
  );
  const [jsonError, setJsonError] = useState('');

  const { data: actorsData } = useQuery({
    queryKey: ['actors'],
    queryFn: () => actorsApi.list({ limit: 100 }),
    enabled: isOpen && !isEdit,
  });

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? tasksApi.update(editTask.id, data) : tasksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    try {
      const input = JSON.parse(form.inputJson);
      setJsonError('');
      mutation.mutate({
        actorId:  form.actorId,
        name:     form.name,
        cronExpr: form.cronExpr || undefined,
        timezone: form.timezone,
        input,
      });
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  const actors = actorsData?.data ?? [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Task' : 'New Scheduled Task'}>
      <div className="space-y-4">
        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Actor</label>
            <select
              value={form.actorId}
              onChange={e => setForm(f => ({ ...f, actorId: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select actor —</option>
              {actors.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        <Input
          label="Task Name"
          placeholder="daily-scrape"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Schedule</label>
          <select
            value={isCustomCron ? '__custom__' : form.cronExpr}
            onChange={e => {
              if (e.target.value === '__custom__') {
                setIsCustomCron(true);
                setForm(f => ({ ...f, cronExpr: '' }));
              } else {
                setIsCustomCron(false);
                setForm(f => ({ ...f, cronExpr: e.target.value }));
              }
            }}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          >
            {CRON_PRESETS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          {isCustomCron && (
            <div className="mb-2">
              <Input
                placeholder="*/30 * * * *"
                value={form.cronExpr}
                onChange={e => setForm(f => ({ ...f, cronExpr: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">Format: minute hour day month weekday</p>
            </div>
          )}

          {form.cronExpr && (
            <p className="text-xs text-blue-400 flex items-center gap-1">
              <Clock size={11} /> {cronToHuman(form.cronExpr)}
            </p>
          )}

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">Timezone</label>
            <select
              value={form.timezone}
              onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
                'Europe/London', 'Europe/Paris', 'Asia/Karachi', 'Asia/Dubai',
                'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'].map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Default Input (JSON)</label>
          <textarea
            value={form.inputJson}
            onChange={e => { setForm(f => ({ ...f, inputJson: e.target.value })); setJsonError(''); }}
            rows={4}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-green-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {jsonError && <p className="text-xs text-red-400 mt-1">{jsonError}</p>}
        </div>

        {mutation.error && (
          <p className="text-sm text-red-400">
            {(mutation.error as any)?.response?.data?.error?.message ?? 'Failed'}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={handleSubmit}
            disabled={!form.name || (!isEdit && !form.actorId)}
          >
            {isEdit ? 'Save Changes' : 'Create Task'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function TasksPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask]     = useState<any>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn:  () => tasksApi.list(),
    refetchInterval: 30_000,
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => tasksApi.run(id),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      window.location.href = `/runs/${run.id}`;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      tasksApi.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const tasks = data?.data ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Scheduled Tasks"
        description="Run actors automatically on a cron schedule"
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Task
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No scheduled tasks yet"
          description="Create a task to run actors on a cron schedule automatically"
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create Task
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task: any) => (
            <div key={task.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    task.status === 'active'
                      ? 'bg-green-400 shadow-[0_0_6px_#4ade80]'
                      : 'bg-gray-600'
                  }`} />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white text-sm">{task.name}</h3>
                      <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded font-mono">
                        {task.actor_name}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      {task.cron_expr ? (
                        <>
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {cronToHuman(task.cron_expr)}
                          </span>
                          <span className="font-mono text-gray-600">{task.cron_expr}</span>
                          {task.next_run_at && task.status === 'active' && (
                            <span className="text-blue-400">
                              Next: {formatDistanceToNow(parseISO(task.next_run_at), { addSuffix: true })}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-600">Manual trigger only</span>
                      )}
                      {task.last_run_at && (
                        <span>
                          Last run: {formatDistanceToNow(parseISO(task.last_run_at), { addSuffix: true })}
                        </span>
                      )}
                      <span>{task.total_runs} total runs</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm" variant="primary"
                    loading={runMutation.isPending && runMutation.variables === task.id}
                    onClick={() => runMutation.mutate(task.id)}
                  >
                    <Play size={12} /> Run now
                  </Button>

                  <Button
                    size="sm" variant="secondary"
                    loading={toggleMutation.isPending}
                    onClick={() =>
                      toggleMutation.mutate({
                        id: task.id,
                        status: task.status === 'active' ? 'paused' : 'active',
                      })
                    }
                  >
                    {task.status === 'active'
                      ? <><Pause size={12} /> Pause</>
                      : <><Play size={12} /> Resume</>
                    }
                  </Button>

                  <Button size="sm" variant="ghost" onClick={() => setEditTask(task)}>
                    Edit
                  </Button>

                  <Button
                    size="sm" variant="ghost"
                    className="text-red-500 hover:text-red-400"
                    onClick={() => confirm(`Delete "${task.name}"?`) && deleteMutation.mutate(task.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TaskModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      {editTask && (
        <TaskModal
          isOpen={!!editTask}
          onClose={() => setEditTask(null)}
          editTask={editTask}
        />
      )}
    </div>
  );
}
