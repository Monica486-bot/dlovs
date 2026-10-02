import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api/client';
import { useT } from '../i18n';

// FR15: unread count, refreshed every minute and whenever the page changes.
export default function NotificationBell({ className = '' }) {
  const { t } = useT();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.get('/notifications')
        .then(({ data }) => { if (!cancelled) setUnread(data.unread); })
        .catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [location.pathname]);

  return (
    <Link to="/notifications" className={`bell ${className}`} aria-label={t('Notifications ({count} unread)', { count: unread })}>
      <span aria-hidden="true">🔔</span> {t('Notifications')}
      {unread > 0 && <span className="bell-count">{unread}</span>}
    </Link>
  );
}
