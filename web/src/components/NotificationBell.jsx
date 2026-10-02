import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api/client';
import { useT } from '../i18n';

// FR15: unread count, refreshed every minute and whenever the page changes.
export default function NotificationBell() {
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
    <Link to="/notifications" className="bell" aria-label={t('Notifications ({count} unread)', { count: unread })} title={t('Notifications')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {unread > 0 && <span className="bell-count">{unread}</span>}
    </Link>
  );
}
