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

// The body of an API error response, e.g. { error: 'Parcel not found', code: 'QR_INVALID' }
export interface ApiErrorBody {
  error?: string;
  code?: string;
}

interface ApiError {
  response?: { status: number; data?: ApiErrorBody };
}

// The HTTP response of a failed request (undefined for a network error).
export function errorResponse(err: unknown): ApiError['response'] {
  return (err as ApiError).response;
}

export function errorMessage(err: unknown, fallback: string): string {
  return errorResponse(err)?.data?.error || fallback;
}

export async function openDocument(documentId: number): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { data, headers } = await api.get<Blob>(`/documents/${documentId}/file`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: headers['content-type'] as string }));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (tab) tab.close();
    throw err;
  }
}

export default api;
