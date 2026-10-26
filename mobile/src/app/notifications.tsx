import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { api, ApiError } from '../api/client';
import { Banner, Button, Empty, List, ListItem, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { screenForLink } from '../utils/push';
import { formatDateTime } from '../utils/format';
import { colors } from '../theme';

// FR15: the same notifications the web app's bell shows: disputes on your
// parcels, document reviews, transfers, report and ID check outcomes.
export default function Notifications() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api.get('/notifications');
      setItems(data.notifications);
      if (data.unread > 0) api.put('/notifications/read-all').catch(() => {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await logout();
        router.replace({ pathname: '/login', params: { returnTo: '/notifications' } });
        return;
      }
      setError(t(err.message));
    }
  }, [logout, t]);

  useFocusEffect(useCallback(() => { if (user) load(); }, [user, load]));

  if (!user) {
    return (
      <Screen>
        <Button title={t('Log In')} onPress={() => router.replace({ pathname: '/login', params: { returnTo: '/notifications' } })} />
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {items && items.length === 0 && <Empty icon="notifications" title={t('No notifications yet.')} />}
      {items?.length > 0 && (
        <List>
          {items.map((n) => (
            <ListItem
              key={n.notification_id}
              icon={n.is_read ? 'notifications-outline' : 'notifications'}
              iconColor={n.is_read ? colors.faint : colors.navy}
              iconBg={n.is_read ? colors.bg : colors.navyPale}
              title={n.message}
              fullTitle
              subtitle={`${n.is_read ? '' : `${t('New')} · `}${formatDateTime(n.created_at)}`}
              onPress={n.link ? () => router.push(screenForLink(n.link)) : undefined}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}

