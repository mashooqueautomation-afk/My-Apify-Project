import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key, Globe, Bell, Building2, Plus,
  Trash2, Copy, CheckCircle, Eye, EyeOff,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/auth';
import { Button, Modal, Input, PageHeader } from '../components/ui/StatusBadge';

type SettingsTab = 'general' | 'api-keys' | 'webhooks';

// ─── API Key Card ─────────────────────────────────────────────────────────────
function ApiKeyCard({ keyData, onRevoke }: { keyData: any; onRevoke: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-white text-sm">{keyData.name}</h3>
            {!keyData.is_active && (
              <span className="text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded border border-red-500/30">
                Revoked
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <code className="text-xs text-gray-400 font-mono bg-gray-800 px-2 py-1 rounded">
              {keyData.key_prefix}{'•'.repeat(20)}
            </code>
            <button
              onClick={() => copy(keyData.key_prefix + '...')}
              className="text-gray-500 hover:text-white transition-colors"
            >
              {copied ? <CheckCircle size={13} className="text-green-400" /> : <Copy size={13} />}
            </button>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span>Scopes: {keyData.scopes?.join(', ')}</span>
            {keyData.last_used_at && (
              <span>Last used: {format(parseISO(keyData.last_used_at), 'MMM dd, yyyy')}</span>
            )}
            {keyData.expires_at && (
              <span className="text-yellow-500">Expires: {format(parseISO(keyData.expires_at), 'MMM dd, yyyy')}</span>
            )}
            <span>Created: {format(parseISO(keyData.created_at), 'MMM dd, yyyy')}</span>
          </div>
        </div>

        {keyData.is_active && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500 hover:text-red-400 flex-shrink-0"
            onClick={() => confirm('Revoke this API key?') && onRevoke(keyData.id)}
          >
            <Trash2 size={13} /> Revoke
          </Button>
        )}
      </div>

      {/* One-time reveal for newly created key */}
      {keyData._rawKey && (
        <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-xs text-green-400 mb-1 font-medium">
            ⚠ Copy this key now — it won't be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-green-300 font-mono bg-gray-950 px-2 py-1 rounded flex-1 break-all">
              {revealed ? keyData._rawKey : '•'.repeat(keyData._rawKey.length)}
            </code>
            <button onClick={() => setRevealed(r => !r)} className="text-gray-400 hover:text-white">
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={() => copy(keyData._rawKey)} className="text-gray-400 hover:text-white">
              {copied ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create API Key Modal ─────────────────────────────────────────────────────
function CreateApiKeyModal({ isOpen, onClose, onCreated }: {
  isOpen: boolean; onClose: () => void; onCreated: (key: any) => void;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['read', 'write']);

  const mutation = useMutation({
    mutationFn: () => authApi.createApiKey(name, scopes),
    onSuccess: (data) => {
      onCreated(data);
      onClose();
      setName('');
    },
  });

  const toggleScope = (scope: string) =>
    setScopes(s => s.includes(scope) ? s.filter(x => x !== scope) : [...s, scope]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create API Key">
      <div className="space-y-4">
        <Input
          label="Key Name"
          placeholder="my-automation-key"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Scopes</label>
          <div className="space-y-2">
            {['read', 'write', 'actor:run', 'dataset:read'].map(scope => (
              <label key={scope} className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => toggleScope(scope)}
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    scopes.includes(scope)
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-gray-800 border-gray-600 group-hover:border-gray-500'
                  }`}
                >
                  {scopes.includes(scope) && (
                    <CheckCircle size={10} className="text-white" />
                  )}
                </div>
                <span className="text-sm text-gray-300 font-mono">{scope}</span>
              </label>
            ))}
          </div>
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
            onClick={() => mutation.mutate()}
            disabled={!name}
          >
            <Key size={14} /> Generate Key
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newlyCreatedKeys, setNewlyCreatedKeys] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const { user } = useAuthStore();

  const { data: apiKeys, isLoading: loadingKeys } = useQuery({
    queryKey: ['api-keys'],
    queryFn:  authApi.apiKeys,
    enabled:  activeTab === 'api-keys',
  });

  const revokeMutation = useMutation({
    mutationFn: authApi.revokeApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const TABS = [
    { id: 'general'  as SettingsTab, label: 'General',  icon: Building2 },
    { id: 'api-keys' as SettingsTab, label: 'API Keys', icon: Key       },
    { id: 'webhooks' as SettingsTab, label: 'Webhooks', icon: Bell      },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title="Settings" description="Manage your account and organization" />

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-44 flex-shrink-0 space-y-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                activeTab === id
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* ── General ───────────────────────────────────── */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Profile</h3>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-blue-700 flex items-center justify-center text-xl font-bold">
                    {user?.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{user?.name}</p>
                    <p className="text-sm text-gray-400">{user?.email}</p>
                    <p className="text-xs text-gray-600 mt-0.5 capitalize">{user?.role}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Platform Info</h3>
                {[
                  { label: 'Version',     value: '1.0.0'         },
                  { label: 'API URL',     value: '/api/v1'       },
                  { label: 'Environment', value: 'production'    },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-2.5 border-b border-gray-800 last:border-0">
                    <span className="text-sm text-gray-400">{label}</span>
                    <span className="text-sm text-white font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── API Keys ──────────────────────────────────── */}
          {activeTab === 'api-keys' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">API Keys</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Use API keys to authenticate programmatic access
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setShowCreateKey(true)}>
                  <Plus size={14} /> New Key
                </Button>
              </div>

              {loadingKeys ? (
                <div className="space-y-3">
                  {[1,2].map(i => (
                    <div key={i} className="h-20 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {(apiKeys || []).map((key: any) => (
                    <ApiKeyCard
                      key={key.id}
                      keyData={
                        newlyCreatedKeys[key.id]
                          ? { ...key, _rawKey: newlyCreatedKeys[key.id] }
                          : key
                      }
                      onRevoke={(id) => revokeMutation.mutate(id)}
                    />
                  ))}
                  {!apiKeys?.length && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                      <Key size={24} className="text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No API keys yet</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Webhooks placeholder ──────────────────────── */}
          {activeTab === 'webhooks' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <Bell size={28} className="text-gray-600 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-gray-300 mb-1">No webhooks configured</h3>
              <p className="text-xs text-gray-500 mb-4">
                Receive HTTP POST notifications when runs complete, fail, or are aborted
              </p>
              <Button variant="secondary" size="sm">
                <Plus size={14} /> Add Webhook
              </Button>
            </div>
          )}
        </div>
      </div>

      <CreateApiKeyModal
        isOpen={showCreateKey}
        onClose={() => setShowCreateKey(false)}
        onCreated={(key) => {
          setNewlyCreatedKeys(prev => ({ ...prev, [key.id]: key.key }));
          queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        }}
      />
    </div>
  );
}
