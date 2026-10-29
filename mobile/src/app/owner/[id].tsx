import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../api/client';
import { Banner, Card, List, ListItem, Muted, Screen, SectionTitle } from '../../components/ui';
import StatusPill from '../../components/StatusPill';
import { useT } from '../../i18n';
import { formatDate } from '../../utils/format';
import { colors } from '../../theme';
import type { OwnerPortfolio as Portfolio } from '../../types';

// FR09: every parcel registered to one owner, so a buyer can check what a
// seller claims to own, and notice a seller with many plots or many recent
// sales. The API leaves out the owner's national ID and phone number.
export default function OwnerPortfolio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get<Portfolio>(`/owners/${id}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(t(err.message)); });
    return () => { cancelled = true; };
  }, [id, t]);

  if (error) return <Screen><Banner tone="danger">{error}</Banner></Screen>;
  if (!data) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={colors.navy} />
      </Screen>
    );
  }
  const { owner, parcels, previously_owned: previous } = data;

  return (
    <Screen>
      <Card style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{owner.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name} accessibilityRole="header">{owner.full_name}</Text>
          <Muted>{t('Current parcels: {now} · Transferred away: {before}', { now: parcels.length, before: previous.length })}</Muted>
        </View>
      </Card>

      <SectionTitle>{t('Current parcels')}</SectionTitle>
      {parcels.length === 0 ? (
        <Card><Muted>{t('No parcels currently registered to this owner.')}</Muted></Card>
      ) : (
        <List>
          {parcels.map((p) => (
            <ListItem
              key={p.parcel_id}
              icon="map"
              title={`${t('Parcel #{id}', { id: p.parcel_id })} · ${p.neighbourhood}`}
              subtitle={t('Registered {date}', { date: formatDate(p.registered_date) })}
              right={<StatusPill status={p.status} />}
              onPress={() => router.push({ pathname: '/parcel/[id]', params: { id: String(p.parcel_id) } })}
            />
          ))}
        </List>
      )}

      {previous.length > 0 && (
        <>
          <SectionTitle>{t('Previously owned')}</SectionTitle>
          <List>
            {previous.map((p) => (
              <ListItem
                key={p.parcel_id}
                icon="swap-horizontal"
                iconColor={colors.muted}
                iconBg={colors.bg}
                title={t('Parcel #{id}', { id: p.parcel_id })}
                subtitle={t('Transferred to {name} on {date}', { name: p.transferred_to, date: formatDate(p.transfer_date) })}
                onPress={() => router.push({ pathname: '/parcel/[id]', params: { id: String(p.parcel_id) } })}
              />
            ))}
          </List>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.white, fontSize: 18, fontWeight: '700' },
  headerText: { flex: 1, gap: 4 },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
});
