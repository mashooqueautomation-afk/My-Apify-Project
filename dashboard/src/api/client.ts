import axios from 'axios';

const API_BASE_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api/v1'
    : '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API ERROR:', error);

    if (error?.response?.status === 401) {
      localStorage.removeItem('token');
    }

    return Promise.reject(error);
  }
);

export const downloadProtectedFile = async (
  url: string,
  filename: string
) => {
  const token = localStorage.getItem('token');

  const response = await axios.get(
    `${API_BASE_URL}${url}`,
    {
      responseType: 'blob',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const blobUrl =
    window.URL.createObjectURL(
      new Blob([response.data])
    );

  const link =
    document.createElement('a');

  link.href = blobUrl;

  link.setAttribute(
    'download',
    filename
  );

  document.body.appendChild(link);

  link.click();

  link.remove();

  window.URL.revokeObjectURL(
    blobUrl
  );
};

export const authApi = {
  login: (data: {
    email: string;
    password: string;
  }) =>
    api.post('/auth/login', data),

  me: () =>
    api.get('/auth/me'),
};

export const actorsApi = {
  list: () =>
    api.get('/actors'),

  detail: (id: string) =>
    api.get(`/actors/${id}`),

  create: (data: any) =>
    api.post('/actors', data),

  update: (
    id: string,
    data: any
  ) =>
    api.patch(
      `/actors/${id}`,
      data
    ),

  delete: (id: string) =>
    api.delete(`/actors/${id}`),

  run: (
    id: string,
    data: any = {}
  ) =>
    api.post(
      `/actors/${id}/runs`,
      data
    ),
};

export const campaignsApi = {
  list: () =>
    api.get('/scraping'),

  detail: (id: string) =>
    api.get(`/scraping/${id}`),

  create: (data: any) =>
    api.post('/scraping', data),

  update: (
    id: string,
    data: any
  ) =>
    api.put(
      `/scraping/${id}`,
      data
    ),

  delete: (id: string) =>
    api.delete(
      `/scraping/${id}`
    ),

  run: (
    id: string,
    data: any = {}
  ) =>
    api.post(
      `/scraping/${id}/run`,
      data
    ),
};

export const scrapingApi = {
  list: () =>
    api.get('/scraping'),

  detail: (id: string) =>
    api.get(`/scraping/${id}`),

  create: (data: any) =>
    api.post('/scraping', data),

  update: (
    id: string,
    data: any
  ) =>
    api.put(
      `/scraping/${id}`,
      data
    ),

  delete: (id: string) =>
    api.delete(
      `/scraping/${id}`
    ),

  run: (
    id: string,
    data: any = {}
  ) =>
    api.post(
      `/scraping/${id}/run`,
      data
    ),
};

export const webhooksApi = {
  list: () =>
    api.get('/webhooks'),

  create: (data: any) =>
    api.post('/webhooks', data),
};

export const metricsApi = {
  overview: () =>
    api.get(
      '/metrics/overview'
    ),

  runsDaily: (
    days: number = 14
  ) =>
    api.get(
      `/metrics/runs/daily?days=${Number(days)}`
    ),
};

export const runsApi = {
  list: (
    limit: number = 10
  ) =>
    api.get(
      `/runs?limit=${Number(limit)}`
    ),

  detail: (id: string) =>
    api.get(`/runs/${id}`),
};

export const datasetsApi = {
  list: () =>
    api.get('/datasets'),
};

export const tasksApi = {
  list: () =>
    api.get('/tasks'),
};

export const usersApi = {
  list: () =>
    api.get('/users'),
};

export const organizationsApi = {
  detail: () =>
    api.get('/organizations'),
};

export const proxiesApi = {
  list: () =>
    api.get('/proxies'),
};

export const kvStoresApi = {
  list: () =>
    api.get('/kv-stores'),
};

export const requestQueuesApi = {
  list: () =>
    api.get('/request-queues'),
};

export const storeApi = {
  listApps: () =>
    api.get('/store/apps'),

  installApp: (
    slug: string,
    data: { name?: string }
  ) =>
    api.post(
      `/store/apps/${slug}/install`,
      data
    ),

  templates: () =>
    api.get('/store/templates'),

  categories: () =>
    api.get('/store/categories'),
};