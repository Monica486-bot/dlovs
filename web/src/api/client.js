import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dlovs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired token or a deactivated account: clear the session and go to the
// login page instead of leaving every page showing errors.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const hadToken = Boolean(error.config?.headers?.Authorization);
    if (error.response?.status === 401 && hadToken && !error.config.url.startsWith('/auth/')) {
      localStorage.removeItem('dlovs_token');
      localStorage.removeItem('dlovs_user');
      window.location.assign('/login?expired=1');
    }
    return Promise.reject(error);
  }
);

export function errorMessage(err, fallback) {
  return err.response?.data?.error || fallback;
}

// Opens an uploaded document in a new tab. The file needs the login token, so
// it's fetched here and handed to the tab as a blob. The tab is opened first
// (synchronously) so pop-up blockers allow it.
export async function openDocument(documentId) {
  const tab = window.open('', '_blank');
  try {
    const { data, headers } = await api.get(`/documents/${documentId}/file`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: headers['content-type'] }));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (tab) tab.close();
    throw err;
  }
}

export default api;
