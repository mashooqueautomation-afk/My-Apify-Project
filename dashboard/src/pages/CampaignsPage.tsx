// dashboard/src/pages/CampaignsPage.tsx

import { useState } from 'react';

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { Link } from 'react-router-dom';

import {
  Plus,
  Play,
  Search,
  Trash2,
  Pencil,
  Save,
  X,
} from 'lucide-react';

import { scrapingApi } from '../api/client';

import {
  Button,
  EmptyState,
  PageHeader,
  StatusBadge,
  Modal,
  Input,
} from '../components/ui/StatusBadge';

function CreateCampaignModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient =
    useQueryClient();

  const [form, setForm] =
    useState({
      name: '',
      description: '',
      runtime: 'playwright',
      status: 'active',
    });

  const mutation = useMutation({
    mutationFn: scrapingApi.create,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['campaigns'],
      });

      onClose();

      setForm({
        name: '',
        description: '',
        runtime: 'playwright',
        status: 'active',
      });
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Campaign"
    >
      <div className="space-y-4">
        <Input
          label="Campaign Name"
          placeholder="LinkedIn Leads"
          value={form.name}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              name: e.target.value,
            }))
          }
        />

        <Input
          label="Description"
          placeholder="Campaign description"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              description:
                e.target.value,
            }))
          }
        />

        <div>
          <label className="mb-2 block text-sm text-slate-300">
            Runtime
          </label>

          <select
            value={form.runtime}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                runtime:
                  e.target.value,
              }))
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white"
          >
            <option value="playwright">
              Playwright
            </option>

            <option value="node18">
              Node 18
            </option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-slate-300">
            Status
          </label>

          <select
            value={form.status}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                status:
                  e.target.value,
              }))
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white"
          >
            <option value="active">
              Active
            </option>

            <option value="draft">
              Draft
            </option>
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-3">
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
              mutation.mutate(form)
            }
          >
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function CampaignsPage() {
  const queryClient =
    useQueryClient();

  const token =
    localStorage.getItem(
      'token'
    ) || '';

  const [showCreate, setShowCreate] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editForm, setEditForm] =
    useState({
      name: '',
      description: '',
      status: 'active',
    });

  const { data, isLoading } =
    useQuery({
      queryKey: ['campaigns'],
      queryFn: scrapingApi.list,
    });

  // HIDE ARCHIVED CAMPAIGNS
  const campaigns = (
    data?.data || []
  )
    .filter(
      (campaign: any) =>
        campaign.status !==
        'archived'
    )
    .filter((campaign: any) =>
      campaign.name
        ?.toLowerCase()
        .includes(
          search.toLowerCase()
        )
    );

  // RUN
  const runMutation =
    useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: any;
      }) =>
        scrapingApi.run(
          id,
          input
        ),
    });

  // UPDATE
  const updateMutation =
    useMutation({
      mutationFn: async ({
        id,
        data,
      }: {
        id: string;
        data: any;
      }) => {
        const response =
          await fetch(
            `http://localhost:3000/api/v1/actors/${id}`,
            {
              method: 'PATCH',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization: `Bearer ${token}`,
              },

              body: JSON.stringify(
                data
              ),
            }
          );

        if (!response.ok) {
          throw new Error(
            'Update failed'
          );
        }

        return response.json();
      },

      onSuccess: () => {
        queryClient.invalidateQueries(
          {
            queryKey: [
              'campaigns',
            ],
          }
        );

        setEditingId(null);
      },
    });

  // DELETE => ARCHIVE
  const deleteMutation =
    useMutation({
      mutationFn: async (
        id: string
      ) => {
        const response =
          await fetch(
            `http://localhost:3000/api/v1/actors/${id}`,
            {
              method: 'PATCH',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization: `Bearer ${token}`,
              },

              body: JSON.stringify({
                status:
                  'archived',
              }),
            }
          );

        if (!response.ok) {
          const errorText =
            await response.text();

          console.error(
            errorText
          );

          throw new Error(
            'Delete failed'
          );
        }

        return response.json();
      },

      onSuccess: () => {
        queryClient.invalidateQueries(
          {
            queryKey: [
              'campaigns',
            ],
          }
        );
      },
    });

  // STATUS
  const statusMutation =
    useMutation({
      mutationFn: async ({
        id,
        status,
      }: {
        id: string;
        status: string;
      }) => {
        const response =
          await fetch(
            `http://localhost:3000/api/v1/actors/${id}`,
            {
              method: 'PATCH',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization: `Bearer ${token}`,
              },

              body: JSON.stringify({
                status,
              }),
            }
          );

        if (!response.ok) {
          throw new Error(
            'Status update failed'
          );
        }

        return response.json();
      },

      onSuccess: () => {
        queryClient.invalidateQueries(
          {
            queryKey: [
              'campaigns',
            ],
          }
        );
      },
    });

  const startEdit = (
    campaign: any
  ) => {
    setEditingId(campaign.id);

    setEditForm({
      name: campaign.name,
      description:
        campaign.description ||
        '',
      status:
        campaign.status ||
        'active',
    });
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="Campaigns"
        description="Manage scraping campaigns"
        actions={
          <Button
            variant="primary"
            onClick={() =>
              setShowCreate(true)
            }
          >
            <Plus size={14} />
            New Campaign
          </Button>
        }
      />

      {/* SEARCH */}
      <div className="mb-6 relative">
        <Search
          size={16}
          className="absolute left-3 top-3.5 text-slate-500"
        />

        <input
          type="text"
          placeholder="Search campaigns..."
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
          className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 py-3 pl-10 pr-4 text-sm text-white outline-none"
        />
      </div>

      {/* LIST */}
      {isLoading ? (
        <div className="text-slate-400">
          Loading...
        </div>
      ) : campaigns.length ===
        0 ? (
        <EmptyState
          icon={Search}
          title="No campaigns"
          description="Create your first campaign."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map(
            (campaign: any) => (
              <div
                key={campaign.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5"
              >
                {editingId ===
                campaign.id ? (
                  <div className="space-y-3">
                    <Input
                      label="Name"
                      value={
                        editForm.name
                      }
                      onChange={(e) =>
                        setEditForm(
                          (
                            f
                          ) => ({
                            ...f,
                            name:
                              e
                                .target
                                .value,
                          })
                        )
                      }
                    />

                    <Input
                      label="Description"
                      value={
                        editForm.description
                      }
                      onChange={(e) =>
                        setEditForm(
                          (
                            f
                          ) => ({
                            ...f,
                            description:
                              e
                                .target
                                .value,
                          })
                        )
                      }
                    />

                    <select
                      value={
                        editForm.status
                      }
                      onChange={(e) =>
                        setEditForm(
                          (
                            f
                          ) => ({
                            ...f,
                            status:
                              e
                                .target
                                .value,
                          })
                        )
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                    >
                      <option value="active">
                        Active
                      </option>

                      <option value="draft">
                        Draft
                      </option>
                    </select>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          updateMutation.mutate(
                            {
                              id: campaign.id,
                              data:
                                editForm,
                            }
                          )
                        }
                      >
                        <Save size={12} />
                        Save
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setEditingId(
                            null
                          )
                        }
                      >
                        <X size={12} />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                          {
                            campaign.runtime
                          }
                        </p>

                        <h2 className="mt-2 text-lg font-semibold text-white">
                          {
                            campaign.name
                          }
                        </h2>
                      </div>

                      <StatusBadge
                        status={
                          campaign.status
                        }
                      />
                    </div>

                    <p className="mt-3 text-sm text-slate-400">
                      {campaign.description ||
                        'No description'}
                    </p>

                    <div className="mt-4">
                      <select
                        value={
                          campaign.status ||
                          'active'
                        }
                        onChange={(e) =>
                          statusMutation.mutate(
                            {
                              id: campaign.id,
                              status:
                                e
                                  .target
                                  .value,
                            }
                          )
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                      >
                        <option value="active">
                          Active
                        </option>

                        <option value="draft">
                          Draft
                        </option>
                      </select>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        to={`/campaigns/${campaign.id}`}
                        className="inline-flex items-center rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400"
                      >
                        Open
                      </Link>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          runMutation.mutate(
                            {
                              id: campaign.id,
                              input: {},
                            }
                          )
                        }
                      >
                        <Play size={12} />
                        Run
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          startEdit(
                            campaign
                          )
                        }
                      >
                        <Pencil size={12} />
                        Edit
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete "${campaign.name}" ?`
                            )
                          ) {
                            deleteMutation.mutate(
                              campaign.id
                            );
                          }
                        }}
                      >
                        <Trash2 size={12} />
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          )}
        </div>
      )}

      <CreateCampaignModal
        isOpen={showCreate}
        onClose={() =>
          setShowCreate(false)
        }
      />
    </div>
  );
}