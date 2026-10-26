const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000/api';

const TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 180000;

let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class NetworkError extends Error {}

interface RequestOptions {
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  form?: FormData;
  timeout?: number;
}

async function request<T = unknown>(method: string, path: string, { body, params, form, timeout = TIMEOUT_MS }: RequestOptions = {}): Promise<T> {
  const query = params
    ? '?' + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}${query}`, {
      method,
      headers: {
        ...(form ? {} : { 'Content-Type': 'application/json' }),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch {
    throw new NetworkError('Could not reach the DLOVS server. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }

  let data: { error?: string; code?: string } | null = null;
  try {
    data = await response.json() as { error?: string; code?: string };
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status, data?.code);
  }
  return data as T;
}

export const api = {
  get: <T = unknown>(path: string, params?: RequestOptions['params']) => request<T>('GET', path, { params }),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T = unknown>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
  upload: <T = unknown>(path: string, form: FormData) => request<T>('POST', path, { form, timeout: UPLOAD_TIMEOUT_MS }),
};
