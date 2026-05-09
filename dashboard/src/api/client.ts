import axios from 'axios';

const API_BASE_URL =
  window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:3000'
    : '';

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

    return Promise.reject(
      error?.response?.data || error
    );
  }
);

export const authApi = {
  login: (data: {
    email: string;
    password: string;
  }) => api.post('/auth/login', data),

  me: () => api.get('/auth/me'),
};

export const actorsApi = {
  list: () => api.get('/actors'),

  create: (data: any) =>
    api.post('/actors', data),

  update: (
    id: string,
    data: any
  ) => api.put(`/actors/${id}`, data),

  delete: (id: string) =>
    api.delete(`/actors/${id}`),
};

export const campaignsApi = {
  list: () => api.get('/scraping'),

  create: (data: any) =>
    api.post('/scraping', data),

  update: (
    id: string,
    data: any
  ) =>
    api.put(`/scraping/${id}`, data),

  delete: (id: string) =>
    api.delete(`/scraping/${id}`),
};

export const webhooksApi = {
  list: () => api.get('/webhooks'),

  create: (data: any) =>
    api.post('/webhooks', data),
};

export const metricsApi = {
  overview: () =>
    api.get('/metrics/overview'),

  runsDaily: (days = 14) =>
    api.get(
      `/metrics/runs/daily?days=${days}`
    ),
};

export const runsApi = {
  list: (limit = 10) =>
    api.get(`/runs?limit=${limit}`),

  detail: (id: string) =>
    api.get(`/runs/${id}`),
};

export const scrapingApi = {
  list: () => api.get('/scraping'),

  create: (data: any) =>
    api.post('/scraping', data),

  update: (
    id: string,
    data: any
  ) =>
    api.put(`/scraping/${id}`, data),

  delete: (id: string) =>
    api.delete(`/scraping/${id}`),
};

export const datasetsApi = {
  list: () => api.get('/datasets'),

  detail: (id: string) =>
    api.get(`/datasets/${id}`),
};

export const tasksApi = {
  list: () => api.get('/tasks'),

  create: (data: any) =>
    api.post('/tasks', data),
};

export const usersApi = {
  list: () => api.get('/users'),
};

export const organizationsApi = {
  detail: () =>
    api.get('/organizations'),
};

export const proxiesApi = {
  list: () => api.get('/proxies'),
};

export const kvStoresApi = {
  list: () => api.get('/kv-stores'),
};

export const requestQueuesApi = {
  list: () =>
    api.get('/request-queues'),
};

export const downloadProtectedFile =
  async (
    url: string,
    filename?: string
  ) => {
    const token =
      localStorage.getItem('token');

    const response = await fetch(
      `${API_BASE_URL}${url}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        'Download failed'
      );
    }

    const blob =
      await response.blob();

    const downloadUrl =
      window.URL.createObjectURL(blob);

    const link =
      document.createElement('a');

    link.href = downloadUrl;

    link.download =
      filename || 'download';

    document.body.appendChild(link);

    link.click();

    link.remove();

    window.URL.revokeObjectURL(
      downloadUrl
    );
  };

export const storeApi = {
  templates: () =>
    api.get('/store/templates'),

  templateDetail: (id: string) =>
    api.get(
      `/store/templates/${id}`
    ),

  categories: () =>
    api.get('/store/categories'),
};