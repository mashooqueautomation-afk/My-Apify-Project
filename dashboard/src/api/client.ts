import axios from 'axios';
import { useAuthStore } from '../store/auth';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

export async function downloadProtectedFile(path: string, fallbackFileName?: string) {
  const response = await apiClient.get(path.replace(/^\/api\/v1/, ''), {
    responseType: 'blob',
  });

  const disposition = response.headers['content-disposition'] as string | undefined;
  const matchedName = disposition?.match(/filename="([^"]+)"/)?.[1];
  const fileName = matchedName || fallbackFileName || 'download';
  const url = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

// Inject token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login:    (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }).then(r => r.data.data),
  register: (data: any) =>
    apiClient.post('/auth/register', data).then(r => r.data.data),
  me:       () =>
    apiClient.get('/auth/me').then(r => r.data.data),
  apiKeys:  () =>
    apiClient.get('/api-keys').then(r => r.data.data),
  createApiKey: (name: string, scopes?: string[]) =>
    apiClient.post('/api-keys', { name, scopes }).then(r => r.data.data),
  rotateApiKey: (id: string) =>
    apiClient.patch(`/api-keys/${id}`, { rotate: true }).then(r => r.data.data),
  updateApiKey: (id: string, data: { name?: string; scopes?: string[]; isActive?: boolean }) =>
    apiClient.patch(`/api-keys/${id}`, data).then(r => r.data.data),
  revokeApiKey: (id: string) =>
    apiClient.delete(`/api-keys/${id}`).then(r => r.data.data),
};

// ─── Scraping Campaigns ───────────────────────────────────────────────────────
export const scrapingApi = {
  list:    (params?: any) =>
    apiClient.get('/scraping', { params }).then(r => r.data),
  get:     (id: string) =>
    apiClient.get(`/scraping/${id}`).then(r => r.data.data),
  create:  (data: any) =>
    apiClient.post('/scraping', data).then(r => r.data.data),
  update:  (id: string, data: any) =>
    apiClient.patch(`/scraping/${id}`, data).then(r => r.data.data),
  run:     (id: string, input: any, options?: any) =>
    apiClient.post(`/scraping/${id}/run`, { input, options }).then(r => r.data.data),
  getRun:  (campaignId: string, runId: string) =>
    apiClient.get(`/scraping/${campaignId}/runs/${runId}`).then(r => r.data.data),
  exportUrl: (campaignId: string, options?: {
    format?: 'excel' | 'csv' | 'json';
    includeMeta?: boolean;
    columns?: string[];
    filterApply?: boolean;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (options?.format) params.set('format', options.format);
    if (options?.includeMeta !== undefined) params.set('includeMeta', String(options.includeMeta));
    if (options?.columns?.length) params.set('columns', options.columns.join(','));
    if (options?.filterApply !== undefined) params.set('filterApply', String(options.filterApply));
    if (options?.limit) params.set('limit', String(options.limit));
    return `/api/v1/scraping/${campaignId}/export?${params.toString()}`;
  },
};

// ─── Compatibility alias ──────────────────────────────────────────────────────
export const actorsApi = {
  list:    (params?: any) =>
    apiClient.get('/actors', { params }).then(r => r.data),
  get:     (id: string) =>
    apiClient.get(`/actors/${id}`).then(r => r.data.data),
  create:  (data: any) =>
    apiClient.post('/actors', data).then(r => r.data.data),
  update:  (id: string, data: any) =>
    apiClient.patch(`/actors/${id}`, data).then(r => r.data.data),
  delete:  (id: string) =>
    apiClient.delete(`/actors/${id}`).then(r => r.data.data),
  run:     (id: string, input: any, options?: any) =>
    apiClient.post(`/actors/${id}/runs`, { input, options }).then(r => r.data.data),
  getRuns: (id: string, params?: any) =>
    apiClient.get(`/actors/${id}/runs`, { params }).then(r => r.data),
};

// ─── Runs ─────────────────────────────────────────────────────────────────────
export const runsApi = {
  list:  (params?: any) =>
    apiClient.get('/runs', { params }).then(r => r.data),
  get:   (id: string) =>
    apiClient.get(`/runs/${id}`).then(r => r.data.data),
  abort: (id: string) =>
    apiClient.post(`/runs/${id}/abort`).then(r => r.data.data),
  getLogs: (id: string, offset = 0) =>
    apiClient.get(`/runs/${id}/log`, { params: { offset } }).then(r => r.data.data),
};

// ─── Datasets ─────────────────────────────────────────────────────────────────
export const datasetsApi = {
  list:    (params?: any) =>
    apiClient.get('/datasets', { params }).then(r => r.data),
  get:     (id: string) =>
    apiClient.get(`/datasets/${id}`).then(r => r.data.data),
  getItems:(id: string, params?: any) =>
    apiClient.get(`/datasets/${id}/items`, { params }).then(r => r.data),
  delete:  (id: string) =>
    apiClient.delete(`/datasets/${id}`).then(r => r.data.data),
  exportUrl: (id: string, format: 'json' | 'csv' | 'jsonl' | 'xls') =>
    `/api/v1/datasets/${id}/export?format=${format}`,
};

export const webhooksApi = {
  list: () =>
    apiClient.get('/webhooks').then(r => r.data.data),
  history: () =>
    apiClient.get('/webhooks/history').then(r => r.data.data),
  create: (data: any) =>
    apiClient.post('/webhooks', data).then(r => r.data.data),
  update: (id: string, data: any) =>
    apiClient.patch(`/webhooks/${id}`, data).then(r => r.data.data),
  delete: (id: string) =>
    apiClient.delete(`/webhooks/${id}`).then(r => r.data.data),
  test: (data: any) =>
    apiClient.post('/webhooks/test', data).then(r => r.data.data),
};

export const storeApi = {
  listApps: (params?: { category?: string; featured?: boolean; search?: string }) =>
    apiClient.get('/store/apps', { params }).then(r => r.data),
  getApp: (slug: string) =>
    apiClient.get(`/store/apps/${slug}`).then(r => r.data.data),
  installApp: (slug: string, payload?: { name?: string }) =>
    apiClient.post(`/store/apps/${slug}/install`, payload || {}).then(r => r.data.data),
};

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasksApi = {
  list:   (params?: any) =>
    apiClient.get('/tasks', { params }).then(r => r.data),
  get:    (id: string) =>
    apiClient.get(`/tasks/${id}`).then(r => r.data.data),
  create: (data: any) =>
    apiClient.post('/tasks', data).then(r => r.data.data),
  update: (id: string, data: any) =>
    apiClient.patch(`/tasks/${id}`, data).then(r => r.data.data),
  run:    (id: string, input?: any) =>
    apiClient.post(`/tasks/${id}/run`, { input }).then(r => r.data.data),
  delete: (id: string) =>
    apiClient.delete(`/tasks/${id}`).then(r => r.data.data),
};

// ─── Metrics ──────────────────────────────────────────────────────────────────
export const metricsApi = {
  overview: () =>
    apiClient.get('/metrics/overview').then(r => r.data.data),
  daily: (days = 30) =>
    apiClient.get('/metrics/runs/daily', { params: { days } }).then(r => r.data.data),
};
