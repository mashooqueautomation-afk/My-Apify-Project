// dashboard/src/pages/IntegrationsPage.tsx

import { useQuery } from '@tanstack/react-query';
import {
  Copy,
  KeyRound,
  Send,
  Workflow,
} from 'lucide-react';

import {
  authApi,
  webhooksApi,
} from '../api/client';

import {
  Button,
  PageHeader,
} from '../components/ui/StatusBadge';

export default function IntegrationsPage() {
  const { data: apiKeys } = useQuery({
    queryKey: ['integration-api-keys'],
    queryFn: authApi.apiKeys,
  });

  const { data: webhooks } = useQuery({
    queryKey: ['integration-webhooks'],
    queryFn: webhooksApi.list,
  });

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="N8N Integrations"
        description="Manage API keys, signed webhooks, and workflow connectivity for automation."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* API KEYS */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <KeyRound size={18} />
              API Keys
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                alert(
                  'Backend API key creation endpoint not connected yet.'
                );
              }}
            >
              Create key
            </Button>
          </div>

          <div className="space-y-3">
            {!apiKeys ||
            apiKeys.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-500">
                No API keys available.
              </div>
            ) : (
              apiKeys.map((key: any) => (
                <div
                  key={key.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 transition hover:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">
                        {key.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {key.key_prefix}
                        ****************
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        copyText(
                          key.key_prefix
                        )
                      }
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    Scopes:{' '}
                    {key.scopes?.join(', ') ||
                      'Full access'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* WEBHOOKS */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Workflow size={18} />
              Webhooks
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                alert(
                  'Webhook testing endpoint not connected yet.'
                );
              }}
            >
              <Send size={13} />
              Test webhook
            </Button>
          </div>

          <div className="space-y-3">
            {!webhooks ||
            webhooks.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-500">
                No webhooks configured.
              </div>
            ) : (
              webhooks.map((hook: any) => (
                <div
                  key={hook.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 transition hover:border-slate-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-white">
                        {hook.campaign_name ||
                          'Global webhook'}
                      </p>

                      <p className="mt-1 break-all text-xs text-slate-500">
                        {hook.url}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        Events:{' '}
                        {hook.events?.join(
                          ', '
                        ) || 'run.completed'}
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        copyText(hook.url)
                      }
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}