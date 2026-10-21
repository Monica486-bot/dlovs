import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { api, ApiError } from '../api/client';
import { Banner, Button, Empty, List, ListItem, Muted, Screen } from '../components/ui';
import StatusPill from '../components/StatusPill';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

// Citizen.viewOwnParcels() — parcels registered under the account's national
// ID, once a land officer has checked the ID card in person.
export default function MyParcels() {
  const { user, logout } = useAuth();
  const { t, tn } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api.get('/parcels/mine'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await logout();
        router.replace({ pathname: '/login', params: { returnTo: '/mine' } });
        return;
      }
      setError(t(err.message));
    }
  }, [logout, t]);

  useFocusEffect(
    useCallback(() => {
      if (user) load();
    }, [user, load])
  );

  if (!user) {
    return (
      <Screen>
        <Muted>{t('Log in to see parcels registered to you.')}</Muted>
        <Button title={t('Log In')} onPress={() => router.replace({ pathname: '/login', params: { returnTo: '/mine' } })} />
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? (
        <>
          <Banner tone="danger">{error}</Banner>
          <Button title={t('Try Again')} onPress={load} />
        </>
      ) : null}
      {data?.message ? <Banner tone="info">{t(data.message)}</Banner> : null}
      {data?.id_status === 'missing' && <Button title={t('Add My National ID')} onPress={() => router.push('/account')} />}
      {data && data.parcels.length === 0 && !data.message && (
        <Empty icon="map" title={t('No parcels are registered to your national ID yet.')} />
      )}
      {data?.parcels.length > 0 && (
        <List>
          {data.parcels.map((p) => (
            <ListItem
              key={p.parcel_id}
              icon="map"
              title={`${t('Parcel #{id}', { id: p.parcel_id })} · ${p.neighbourhood}`}
              subtitle={[
                p.verified_documents + p.pending_documents === 0
                  ? t('No documents uploaded')
                  : t('Documents: {verified} verified, {pending} awaiting review', { verified: p.verified_documents, pending: p.pending_documents }),
                p.open_disputes > 0 ? tn('{n} open dispute', '{n} open disputes', p.open_disputes) : null,
                p.transfer_pending ? t('transfer requested') : null,
              ].filter(Boolean).join(' · ')}
              right={<StatusPill status={p.status} />}
              onPress={() => router.push({ pathname: '/my-parcel/[id]', params: { id: String(p.parcel_id) } })}
            />
          ))}
        </List>
      )}
      {data?.id_status === 'verified' && (
        <Button title={t('Report an Unregistered Plot')} icon="flag" variant="ghost" onPress={() => router.push('/report-plot')} />
      )}
    </Screen>
  );
}

