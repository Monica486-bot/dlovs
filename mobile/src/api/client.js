// Fetch wrapper for the DLOVS API (address from EXPO_PUBLIC_API_URL).
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000/api';

// Generous timeout for 2G/3G connections (NFR01 targets 3 s, but a slow
// network shouldn't be mistaken for "offline" too eagerly). Uploads get longer:
// a 5 MB scan takes minutes on 2G.
const TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 180000;

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code; // e.g. PHONE_NOT_VERIFIED, QR_INVALID
  }
}

// Thrown when the request never reached the server. The caller should fall
// back to the offline cache.
export class NetworkError extends Error {}

async function request(method, path, { body, params, form, timeout = TIMEOUT_MS } = {}) {
  const query = params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()
    : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetch(`${API_URL}${path}${query}`, {
      method,
      headers: {
        // multipart uploads set their own Content-Type with the boundary
        ...(form ? {} : { 'Content-Type': 'application/json' }),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch (err) {
    throw new NetworkError('Could not reach the DLOVS server. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status, data?.code);
  }
  return data;
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  delete: (path, body) => request('DELETE', path, { body }),
  // FormData with a file part (FR10 document upload)
  upload: (path, form) => request('POST', path, { form, timeout: UPLOAD_TIMEOUT_MS }),
};
