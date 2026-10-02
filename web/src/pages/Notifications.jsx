import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import { formatDateTime } from '../utils/format';

// FR15: in-app notifications for citizens and staff.
export default function Notifications() {
  const { t } = useT();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/notifications')
      .then(({ data: d }) => setData(d))
      .catch((err) => setError(errorMessage(err, t('Failed to load notifications'))));
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function open(n) {
    if (!n.is_read) await api.put(`/notifications/${n.notification_id}/read`).catch(() => {});
    if (n.link) navigate(n.link);
    else load();
  }

  async function markAll() {
    await api.put('/notifications/read-all').catch(() => {});
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('Notifications')}</h2>
        {data?.unread > 0 && <button className="btn secondary" onClick={markAll}>{t('Mark all as read')}</button>}
      </div>
      {error && <div className="error-text">{error}</div>}
      {data?.notifications.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>{t('No notifications yet.')}</p></div>}
      <ul className="notification-list">
        {data?.notifications.map((n) => (
          <li key={n.notification_id}>
            <button type="button" className={`notification ${n.is_read ? '' : 'unread'}`} onClick={() => open(n)}>
              <span className="notification-message">{n.message}</span>
              <span className="muted small">{formatDateTime(n.created_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
