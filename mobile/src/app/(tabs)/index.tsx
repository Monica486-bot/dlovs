import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { Banner, Button, Card, Icon, List, ListItem, Muted, SectionTitle } from '../../components/ui';
import StatusPill from '../../components/StatusPill';
import LanguageToggle from '../../components/LanguageToggle';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { colors } from '../../theme';
import type { NotificationList, OwnParcels } from '../../types';

// Home: one heading, one main action (scan), two secondary ones, as in the
// README screenshots.
export default function Home() {
  const { user, ready } = useAuth();
  const { t, tn, rtl } = useT();
  const insets = useSafeAreaInsets();
  const [unread, setUnread] = useState(0);
  const [mine, setMine] = useState<OwnParcels | null>(null);
  const citizen = user?.role === 'citizen';

  useFocusEffect(
    useCallback(() => {
      if (!ready || !user) return;
      api.get<NotificationList>('/notifications').then((data) => setUnread(data.unread)).catch(() => {});
      if (user.role === 'citizen') api.get<OwnParcels>('/parcels/mine').then(setMine).catch(() => {});
    }, [ready, user])
  );

  return (
    <View style={[styles.page, { direction: rtl ? 'rtl' : 'ltr' }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.brand}>DLOVS</Text>
        <View style={styles.barActions}>
          {user ? (
            <Pressable
              onPress={() => router.push('/notifications')}
              accessibilityRole="button"
              accessibilityLabel={unread > 0 ? t('Notifications ({n} new)', { n: unread }) : t('Notifications')}
              hitSlop={8}
              style={styles.bell}
            >
              <Icon name="notifications-outline" size={24} color={colors.white} />
              {unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
            </Pressable>
          ) : null}
          <LanguageToggle />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">{t('Check who owns a plot before you pay')}</Text>
        <Muted style={styles.subtitle}>
          {user
            ? t('Signed in as {name}', { name: user.full_name })
            : t('Scan the QR code on the plot marker or search the register. No account needed.')}
        </Muted>

        <Button title={t('Scan Parcel QR Code')} onPress={() => router.push('/scan')} />
        <Button title={t('Search by Parcel ID, Owner, or Area')} variant="secondary" onPress={() => router.push('/search')} />
        <Button title={t('Recently Viewed (works offline)')} variant="secondary" onPress={() => router.push('/recent')} />

        {!ready ? null : citizen ? (
          <>
            <SectionTitle
              action={(mine?.parcels?.length ?? 0) > 2 ? <Text style={styles.link} onPress={() => router.push('/mine')}>{t('See all')}</Text> : null}
            >
              {t('My land')}
            </SectionTitle>
            {mine?.message ? <Banner tone="info">{t(mine.message)}</Banner> : null}
            {mine && mine.parcels.length > 0 && (
              <List>
                {mine.parcels.slice(0, 2).map((p) => (
                  <ListItem
                    key={p.parcel_id}
                    title={`${t('Parcel #{id}', { id: p.parcel_id })} · ${p.neighbourhood}`}
                    subtitle={p.open_disputes > 0 ? tn('{n} open dispute', '{n} open disputes', p.open_disputes) : p.transfer_pending ? t('transfer requested') : null}
                    right={<StatusPill status={p.status} />}
                    onPress={() => router.push({ pathname: '/my-parcel/[id]', params: { id: String(p.parcel_id) } })}
                  />
                ))}
              </List>
            )}
          </>
        ) : user ? (
          <Muted style={styles.centered}>{t('Officer and administrator tools are in the DLOVS web portal.')}</Muted>
        ) : (
          <Card>
            <Text style={styles.cardTitle}>{t('Own land or want to report a problem?')}</Text>
            <Muted>{t('An account lets you see parcels registered to your national ID and flag disputes.')}</Muted>
            <Button title={t('Log In')} variant="secondary" onPress={() => router.push('/login')} />
            <Button title={t('Create Account')} variant="secondary" onPress={() => router.push('/register')} />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  bar: {
    backgroundColor: colors.navy, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  brand: { color: colors.white, fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  barActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bell: { padding: 4 },
  badge: {
    position: 'absolute', top: -2, end: -4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 2, borderColor: colors.navy,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },

  content: { padding: 16, paddingBottom: 32, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.navy, lineHeight: 32, marginTop: 4 },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 6 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  centered: { textAlign: 'center', marginTop: 8 },
  link: { color: colors.navyLight, fontWeight: '700', fontSize: 14 },
});
