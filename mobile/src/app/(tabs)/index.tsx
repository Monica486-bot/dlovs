import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { Banner, Icon, List, ListItem, Muted, SectionTitle } from '../../components/ui';
import StatusPill from '../../components/StatusPill';
import LanguageToggle from '../../components/LanguageToggle';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { colors, radius, shadow } from '../../theme';
import type { IconName } from '../../components/ui';
import type { NotificationList, OwnParcels } from '../../types';

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
    <ScrollView style={[styles.page, { direction: rtl ? 'rtl' : 'ltr' }]} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
        <View style={styles.heroTop}>
          <View style={styles.brand}>
            <View style={styles.brandMark}><Icon name="shield-checkmark" size={18} color={colors.navy} /></View>
            <Text style={styles.brandText}>DLOVS</Text>
          </View>
          <View style={styles.heroActions}>
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
        <Text style={styles.heroTitle} accessibilityRole="header">{t('Check who owns a plot before you pay')}</Text>
        <Text style={styles.heroSubtitle}>
          {user ? t('Signed in as {name}', { name: user.full_name }) : t('No account needed to verify a plot.')}
        </Text>
      </View>

      <View style={styles.body}>
        <Pressable onPress={() => router.push('/scan')} accessibilityRole="button" style={({ pressed }) => [styles.scanCard, pressed && styles.pressed]}>
          <View style={styles.scanIcon}><Icon name="qr-code" size={30} color={colors.white} /></View>
          <View style={styles.scanText}>
            <Text style={styles.scanTitle}>{t('Scan a plot marker')}</Text>
            <Text style={styles.scanSubtitle}>{t('Point your camera at the QR code on the marker.')}</Text>
          </View>
          <Icon name="chevron-forward" size={22} color={colors.faint} />
        </Pressable>

        <View style={styles.tiles}>
          <Tile icon="search" title={t('Search')} subtitle={t('ID, name, area or GPS')} onPress={() => router.push('/search')} />
          <Tile icon="bookmark" title={t('Saved')} subtitle={t('Works offline')} onPress={() => router.push('/recent')} />
        </View>

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
                    icon="map"
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
          <Pressable onPress={() => router.push('/login')} accessibilityRole="link" style={styles.ownLand}>
            <Text style={styles.ownLandText}>
              {t('Own land here?')} <Text style={styles.link}>{t('Log in')}</Text>
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

interface TileProps {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function Tile({ icon, title, subtitle, onPress }: TileProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.tileIcon}><Icon name={icon} size={22} color={colors.navy} /></View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 32 },
  pressed: { opacity: 0.85 },

  hero: { backgroundColor: colors.navy, paddingHorizontal: 20, paddingBottom: 56, gap: 8 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bell: { padding: 4 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: colors.white, fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: colors.white, fontSize: 26, fontWeight: '800', lineHeight: 32 },
  heroSubtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 15 },

  body: { paddingHorizontal: 16, gap: 14, marginTop: -36 },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    ...shadow,
    elevation: 4,
  },
  scanIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  scanText: { flex: 1, gap: 3 },
  scanTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  scanSubtitle: { fontSize: 14, color: colors.muted, lineHeight: 19 },

  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 4, ...shadow },
  tileIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.navyPale, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  tileTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  tileSubtitle: { fontSize: 13, color: colors.muted },

  centered: { textAlign: 'center', marginTop: 8 },
  ownLand: { alignItems: 'center', paddingVertical: 10 },
  ownLandText: { fontSize: 15, color: colors.muted },
  link: { color: colors.navyLight, fontWeight: '700', fontSize: 14 },
  badge: {
    position: 'absolute', top: -2, end: -4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 2, borderColor: colors.navy,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
});
