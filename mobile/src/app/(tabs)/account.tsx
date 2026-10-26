import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../api/client';
import { Banner, Button, Card, Chips, Empty, Field, List, ListItem, Muted, Screen, SectionTitle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { colors } from '../../theme';

const ROLE_LABELS = { citizen: 'Citizen', land_officer: 'Land Officer', administrator: 'Administrator' };

// The citizen's profile: the national ID that links the account to land
// (set once; an officer confirms it in person), and the app language (FR19).
export default function Account() {
  const { user, refreshUser, logout } = useAuth();
  const { t, lang, setLang } = useT();
  const [nationalId, setNationalId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // pick up an officer's ID check since the last visit
  const userId = user?.user_id;
  useFocusEffect(useCallback(() => { if (userId) refreshUser().catch(() => {}); }, [refreshUser, userId]));

  const language = (
    <>
      <SectionTitle>{t('Language')}</SectionTitle>
      <Chips label={t('Language')} options={[{ key: 'en', label: 'English' }, { key: 'ar', label: 'العربية' }]} value={lang} onChange={setLang} />
    </>
  );

  if (!user) {
    return (
      <Screen>
        <Card>
          <Empty icon="person" title={t('Own land or want to report a problem?')}>
            {t('View your parcels, upload documents and flag disputes.')}
          </Empty>
          <Button title={t('Log In')} icon="log-in" onPress={() => router.push({ pathname: '/login', params: { returnTo: '/account' } })} />
          <Button title={t('Create Account')} variant="secondary" onPress={() => router.push('/register')} />
        </Card>
        {language}
      </Screen>
    );
  }

  async function saveNationalId() {
    setLoading(true);
    setError('');
    try {
      await api.put('/auth/profile', { national_id: nationalId.trim() });
      await refreshUser();
      setSaved(true);
    } catch (err) {
      setError(t(err.message));
    } finally {
      setLoading(false);
    }
  }

  const citizen = user.role === 'citizen';
  const idStatus = !user.national_id ? 'missing' : user.national_id_verified ? 'verified' : 'pending';
  const initials = user.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('');

  return (
    <Screen>
      <Card style={styles.profile}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.profileText}>
          <Text style={styles.name}>{user.full_name}</Text>
          <Muted>{user.phone_number} · {t(ROLE_LABELS[user.role] || user.role)}</Muted>
        </View>
      </Card>

      {citizen && (
        <List>
          <ListItem icon="map" title={t('My Parcels')} onPress={() => router.push('/mine')} />
          <ListItem icon="notifications" title={t('Notifications')} onPress={() => router.push('/notifications')} />
          <ListItem icon="flag" title={t('Report an Unregistered Plot')} onPress={() => router.push('/report-plot')} />
        </List>
      )}

      {citizen && (
        <>
          <SectionTitle>{t('National ID')}</SectionTitle>
          {idStatus === 'verified' && (
            <Banner tone="success" title={user.national_id}>{t('National ID confirmed. Your parcels appear under My Parcels.')}</Banner>
          )}
          {idStatus === 'pending' && (
            <Banner tone="info" title={user.national_id}>{t('National ID saved. To link land registered to it, show your ID card at the land office once.')}</Banner>
          )}
          {idStatus === 'missing' && (
            <Card>
              <Field
                label={t('National ID')}
                value={nationalId}
                onChangeText={setNationalId}
                autoCapitalize="characters"
                hint={t('Links your account to parcels registered to you. Never shown to others, and can only be set once.')}
              />
              {error ? <Banner tone="danger">{error}</Banner> : null}
              <Button title={t('Save National ID')} onPress={saveNationalId} loading={loading} disabled={!nationalId.trim()} />
            </Card>
          )}
          {saved && <Banner tone="success">{t('Saved.')}</Banner>}
        </>
      )}

      {!citizen && <Muted>{t('Officer and administrator tools are in the DLOVS web portal.')}</Muted>}

      {language}

      <Button title={t('Log Out')} icon="log-out" variant="ghost" onPress={async () => { await logout(); router.dismissTo('/'); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 20, fontWeight: '800' },
  profileText: { flex: 1, gap: 2 },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
});
