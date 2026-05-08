// dashboard/src/pages/SettingsPage.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  Key,
  Globe,
  Bell,
  Building2,
  Plus,
  Trash2,
  Copy,
  CheckCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

import { format, parseISO } from 'date-fns';

import { authApi } from '../api/client';

import { useAuthStore } from '../store/auth';

import {
  Button,
  Modal,
  Input,
  PageHeader,
} from '../components/ui/StatusBadge';

type SettingsTab =
  | 'general'
  | 'api-keys'
  | 'webhooks';

type WebhookType = {
  id: string;
  name: string;
  url: string;
  event: string;
};

// ─────────────────────────────────────────────────────────────
// API KEY CARD
// ─────────────────────────────────────────────────────────────

function ApiKeyCard({
  keyData,
  onRevoke,
}: {
  keyData: any;
  onRevoke: (id: string) => void;
}) {
  const [copied, setCopied] =
    useState(false);

  const [revealed, setRevealed] =
    useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);

    setCopied(true);

    setTimeout(
      () => setCopied(false),
      2000
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-white text-sm">
              {keyData.name}
            </h3>

            {!keyData.is_active && (
              <span className="text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded border border-red-500/30">
                Revoked
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <code className="text-xs text-gray-400 font-mono bg-gray-800 px-2 py-1 rounded">
              {keyData.key_prefix}
              {'•'.repeat(20)}
            </code>

            <button
              onClick={() =>
                copy(
                  keyData.key_prefix +
                    '...'
                )
              }
              className="text-gray-500 hover:text-white transition-colors"
            >
              {copied ? (
                <CheckCircle
                  size={13}
                  className="text-green-400"
                />
              ) : (
                <Copy size={13} />
              )}
            </button>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span>
              Scopes:{' '}
              {keyData.scopes?.join(', ')}
            </span>

            {keyData.created_at && (
              <span>
                Created:{' '}
                {format(
                  parseISO(
                    keyData.created_at
                  ),
                  'MMM dd, yyyy'
                )}
              </span>
            )}
          </div>
        </div>

        {keyData.is_active && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-400 flex-shrink-0"
            onClick={() =>
              confirm(
                'Revoke this API key?'
              ) &&
              onRevoke(keyData.id)
            }
          >
            <Trash2 size={13} /> Revoke
          </Button>
        )}
      </div>

      {keyData._rawKey && (
        <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-xs text-green-400 mb-1 font-medium">
            Copy this key now
          </p>

          <div className="flex items-center gap-2">
            <code className="text-xs text-green-300 font-mono bg-gray-950 px-2 py-1 rounded flex-1 break-all">
              {revealed
                ? keyData._rawKey
                : '•'.repeat(
                    keyData._rawKey.length
                  )}
            </code>

            <button
              onClick={() =>
                setRevealed((r) => !r)
              }
              className="text-gray-400 hover:text-white"
            >
              {revealed ? (
                <EyeOff size={14} />
              ) : (
                <Eye size={14} />
              )}
            </button>

            <button
              onClick={() =>
                copy(keyData._rawKey)
              }
              className="text-gray-400 hover:text-white"
            >
              {copied ? (
                <CheckCircle
                  size={14}
                  className="text-green-400"
                />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CREATE API KEY MODAL
// ─────────────────────────────────────────────────────────────

function CreateApiKeyModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (key: any) => void;
}) {
  const [name, setName] =
    useState('');

  const [scopes, setScopes] =
    useState(['read', 'write']);

  const mutation = useMutation({
    mutationFn: () =>
      authApi.createApiKey(
        name,
        scopes
      ),

    onSuccess: (data) => {
      onCreated(data);

      onClose();

      setName('');
    },
  });

  const toggleScope = (
    scope: string
  ) =>
    setScopes((s) =>
      s.includes(scope)
        ? s.filter((x) => x !== scope)
        : [...s, scope]
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create API Key"
    >
      <div className="space-y-4">
        <Input
          label="Key Name"
          placeholder="my-api-key"
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
        />

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Scopes
          </label>

          <div className="space-y-2">
            {[
              'read',
              'write',
              'actor:run',
              'dataset:read',
            ].map((scope) => (
              <label
                key={scope}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <div
                  onClick={() =>
                    toggleScope(scope)
                  }
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    scopes.includes(scope)
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-gray-800 border-gray-600'
                  }`}
                >
                  {scopes.includes(
                    scope
                  ) && (
                    <CheckCircle
                      size={10}
                      className="text-white"
                    />
                  )}
                </div>

                <span className="text-sm text-gray-300 font-mono">
                  {scope}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={() =>
              mutation.mutate()
            }
            disabled={!name}
          >
            <Key size={14} />
            Generate Key
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// CREATE WEBHOOK MODAL
// ─────────────────────────────────────────────────────────────

function CreateWebhookModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    webhook: WebhookType
  ) => void;
}) {
  const [name, setName] =
    useState('');

  const [url, setUrl] =
    useState('');

  const [event, setEvent] =
    useState('run.completed');

  const handleCreate = () => {
    if (!name || !url) return;

    onCreate({
      id: crypto.randomUUID(),
      name,
      url,
      event,
    });

    setName('');
    setUrl('');
    setEvent('run.completed');

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Webhook"
    >
      <div className="space-y-4">
        <Input
          label="Webhook Name"
          placeholder="Slack Alerts"
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
        />

        <Input
          label="Webhook URL"
          placeholder="https://yourdomain.com/webhook"
          value={url}
          onChange={(e) =>
            setUrl(e.target.value)
          }
        />

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Event
          </label>

          <select
            value={event}
            onChange={(e) =>
              setEvent(
                e.target.value
              )
            }
            className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="run.completed">
              run.completed
            </option>

            <option value="run.failed">
              run.failed
            </option>

            <option value="run.started">
              run.started
            </option>
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            onClick={handleCreate}
          >
            <Plus size={14} />
            Create Webhook
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN SETTINGS PAGE
// ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] =
    useState<SettingsTab>('general');

  const [showCreateKey, setShowCreateKey] =
    useState(false);

  const [
    showCreateWebhook,
    setShowCreateWebhook,
  ] = useState(false);

  const [newlyCreatedKeys,
    setNewlyCreatedKeys] =
    useState<Record<string, string>>(
      {}
    );

  const [webhooks, setWebhooks] =
    useState<WebhookType[]>([]);

  const queryClient =
    useQueryClient();

  const { user } =
    useAuthStore();

  const {
    data: apiKeys,
    isLoading: loadingKeys,
  } = useQuery({
    queryKey: ['api-keys'],
    queryFn: authApi.apiKeys,
    enabled:
      activeTab === 'api-keys',
  });

  const revokeMutation =
    useMutation({
      mutationFn:
        authApi.revokeApiKey,

      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: ['api-keys'],
        }),
    });

  const TABS = [
    {
      id: 'general' as SettingsTab,
      label: 'General',
      icon: Building2,
    },

    {
      id: 'api-keys' as SettingsTab,
      label: 'API Keys',
      icon: Key,
    },

    {
      id: 'webhooks' as SettingsTab,
      label: 'Webhooks',
      icon: Bell,
    },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Settings"
        description="Manage your account and organization"
      />

      <div className="flex gap-6">
        {/* SIDEBAR */}
        <nav className="w-44 flex-shrink-0 space-y-1">
          {TABS.map(
            ({
              id,
              label,
              icon: Icon,
            }) => (
              <button
                key={id}
                onClick={() =>
                  setActiveTab(id)
                }
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeTab === id
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            )
          )}
        </nav>

        {/* CONTENT */}
        <div className="flex-1 min-w-0">

          {/* GENERAL */}
          {activeTab ===
            'general' && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">
                  Profile
                </h3>

                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-blue-700 flex items-center justify-center text-xl font-bold">
                    {user?.name?.[0]?.toUpperCase()}
                  </div>

                  <div>
                    <p className="font-semibold text-white">
                      {user?.name}
                    </p>

                    <p className="text-sm text-gray-400">
                      {user?.email}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* API KEYS */}
          {activeTab ===
            'api-keys' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    API Keys
                  </h3>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    setShowCreateKey(
                      true
                    )
                  }
                >
                  <Plus size={14} />
                  New Key
                </Button>
              </div>

              {loadingKeys ? (
                <div className="h-20 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
              ) : (
                <div className="space-y-3">
                  {(apiKeys || []).map(
                    (key: any) => (
                      <ApiKeyCard
                        key={key.id}
                        keyData={
                          newlyCreatedKeys[
                            key.id
                          ]
                            ? {
                                ...key,
                                _rawKey:
                                  newlyCreatedKeys[
                                    key.id
                                  ],
                              }
                            : key
                        }
                        onRevoke={(
                          id
                        ) =>
                          revokeMutation.mutate(
                            id
                          )
                        }
                      />
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* WEBHOOKS */}
          {activeTab ===
            'webhooks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Webhooks
                  </h3>

                  <p className="text-xs text-gray-500 mt-1">
                    Receive run notifications
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    setShowCreateWebhook(
                      true
                    )
                  }
                >
                  <Plus size={14} />
                  Add Webhook
                </Button>
              </div>

              {!webhooks.length ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                  <Bell
                    size={28}
                    className="text-gray-600 mx-auto mb-3"
                  />

                  <h3 className="text-sm font-medium text-gray-300 mb-1">
                    No webhooks configured
                  </h3>
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooks.map(
                    (hook) => (
                      <div
                        key={hook.id}
                        className="bg-gray-900 border border-gray-800 rounded-xl p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Globe
                                size={15}
                                className="text-cyan-400"
                              />

                              <p className="text-sm font-semibold text-white">
                                {hook.name}
                              </p>
                            </div>

                            <p className="text-xs text-gray-500 mt-2 break-all">
                              {hook.url}
                            </p>

                            <p className="text-xs text-cyan-400 mt-2">
                              {hook.event}
                            </p>
                          </div>

                          <button
                            onClick={() =>
                              setWebhooks(
                                (
                                  prev
                                ) =>
                                  prev.filter(
                                    (
                                      w
                                    ) =>
                                      w.id !==
                                      hook.id
                                  )
                              )
                            }
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <CreateApiKeyModal
        isOpen={showCreateKey}
        onClose={() =>
          setShowCreateKey(false)
        }
        onCreated={(key) => {
          setNewlyCreatedKeys(
            (prev) => ({
              ...prev,
              [key.id]: key.key,
            })
          );

          queryClient.invalidateQueries(
            {
              queryKey: [
                'api-keys',
              ],
            }
          );
        }}
      />

      <CreateWebhookModal
        isOpen={showCreateWebhook}
        onClose={() =>
          setShowCreateWebhook(
            false
          )
        }
        onCreate={(webhook) =>
          setWebhooks((prev) => [
            webhook,
            ...prev,
          ])
        }
      />
    </div>
  );
}