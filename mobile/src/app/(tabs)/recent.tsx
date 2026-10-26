import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Empty, List, ListItem, Muted, Screen } from '../../components/ui';
import StatusPill from '../../components/StatusPill';
import { listCachedRecords } from '../../utils/cache';
import { formatDateTime } from '../../utils/format';
import { useT } from '../../i18n';

// FR16: the last 50 records viewed on this phone, available without a connection.
export default function Saved() {
  const { t } = useT();
  const [entries, setEntries] = useState(null);

  useFocusEffect(
    useCallback(() => {
      listCachedRecords().then(setEntries);
    }, [])
  );

  if (!entries) return <Screen />;

  if (entries.length === 0) {
    return (
      <Screen>
        <Empty icon="bookmark" title={t('No saved records yet')}>
          {t('Every parcel you open is saved here, so you can still check it without a connection.')}
        </Empty>
      </Screen>
    );
  }

  return (
    <Screen>
      <Muted>{t('{n} of up to 50 recent records are saved on this phone and available offline.', { n: entries.length })}</Muted>
      <List>
        {entries.map(({ parcelId, cachedAt, record }) => (
          <ListItem
            key={parcelId}
            icon="map"
            title={`${t('Parcel #{id}', { id: parcelId })} · ${record.parcel.neighbourhood}`}
            subtitle={`${record.parcel.owner_name} · ${t('Saved {time}', { time: formatDateTime(cachedAt) })}`}
            right={<StatusPill status={record.parcel.status} />}
            onPress={() => router.push({ pathname: '/parcel/[id]', params: { id: parcelId } })}
          />
        ))}
      </List>
    </Screen>
  );
}
