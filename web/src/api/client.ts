import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dlovs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: { config?: { headers?: { Authorization?: string }; url?: string }; response?: { status: number } }) => {
    const hadToken = Boolean(error.config?.headers?.Authorization);
    if (error.response?.status === 401 && hadToken && !error.config?.url?.startsWith('/auth/')) {
      localStorage.removeItem('dlovs_token');
      localStorage.removeItem('dlovs_user');
      window.location.assign('/login?expired=1');
    }
    return Promise.reject(error);
  }
);

export function errorMessage(err: { response?: { data?: { error?: string } } }, fallback: string): string {
  return err.response?.data?.error || fallback;
}

export async function openDocument(documentId: number): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { data, headers } = await api.get(`/documents/${documentId}/file`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: headers['content-type'] as string }));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (tab) tab.close();
    throw err;
  }
}

export default api;
