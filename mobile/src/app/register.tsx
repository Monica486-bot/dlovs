import { useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Field, Muted, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { useT } from '../i18n';
import { errorMessage } from '../api/client';

// four names, as on the national ID card or passport
const NAME_PARTS = ['First name', 'Middle name', 'Second middle name', 'Surname'];

// the same privacy policy the website shows
const PRIVACY_URL = 'https://dlovs-juba.netlify.app/privacy';

// FR01: citizens register with phone number and password (no email), then
// confirm the number with the SMS code on the next screen.
export default function Register() {
  const { register } = useAuth();
  const { t } = useT();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [form, setForm] = useState({ names: ['', '', '', ''], phone_number: '', national_id: '', password: '', confirm: '' });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key: 'phone_number' | 'national_id' | 'password' | 'confirm') => (value: string) => setForm({ ...form, [key]: value });

  async function submit() {
    if (form.password !== form.confirm) {
      setError(t('Passwords do not match'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await register({
        full_name: form.names.map((n) => n.trim()).join(' '),
        phone_number: form.phone_number.trim(),
        national_id: form.national_id.trim() || undefined,
        password: form.password,
      });
      router.replace({
        pathname: '/verify-phone',
        params: { phone: data.phone_number, devCode: data.dev_code || '', returnTo: returnTo || '' },
      });
    } catch (err) {
      setError(t(errorMessage(err)));
    } finally {
      setLoading(false);
    }
  }

  const incomplete = form.names.some((n) => !n.trim()) || !form.phone_number.trim() || form.password.length < 8 || !agreed;

  return (
    <Screen>
      <Text style={styles.heading}>{t('Full name')}</Text>
      <Muted>{t('As on the national ID or passport.')}</Muted>
      {NAME_PARTS.map((label, i) => (
        <Field
          key={label}
          label={t(label)}
          value={form.names[i]}
          onChangeText={(value) => setForm({ ...form, names: form.names.map((n, j) => (j === i ? value : n)) })}
          autoCapitalize="words"
        />
      ))}
      <Field
        label={t('Phone number')}
        value={form.phone_number}
        onChangeText={set('phone_number')}
        placeholder="0912 345 678"
        hint={t('Zain (091), MTN (092) or Digitel (098) number')}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Field
        label={t('National ID (optional)')}
        value={form.national_id}
        onChangeText={set('national_id')}
        autoCapitalize="characters"
      />
      <Muted>
        {t('Links your account to parcels registered to you. Never shown to others, and can only be set once.')}
      </Muted>
      <Field
        label={t('Password (at least 8 characters)')}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
      />
      <Field label={t('Confirm password')} value={form.confirm} onChangeText={set('confirm')} secureTextEntry />
      <View style={styles.consent}>
        <Switch value={agreed} onValueChange={setAgreed} accessibilityLabel={t('Privacy Policy')} />
        <Text style={styles.consentText}>
          {t('I have read the')}{' '}
          <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>{t('Privacy Policy')}</Text>{' '}
          {t('and agree that DLOVS may store my details as it describes.')}
        </Text>
      </View>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button title={t('Create Account')} onPress={submit} loading={loading} disabled={incomplete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 14, fontWeight: '600', color: colors.text },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  consentText: { flex: 1, fontSize: 13, color: colors.text },
  link: { color: colors.navyLight, fontWeight: '600', textDecorationLine: 'underline' },
});
