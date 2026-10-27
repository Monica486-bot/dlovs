import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Field, Muted, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { useT } from '../i18n';
import { errorMessage } from '../api/client';

// four names, as on the national ID card or passport
const NAME_PARTS = ['First name', 'Middle name', 'Second middle name', 'Surname'];

// FR01: citizens register with phone number and password (no email), then
// confirm the number with the SMS code on the next screen.
export default function Register() {
  const { register } = useAuth();
  const { t } = useT();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [form, setForm] = useState({ names: ['', '', '', ''], phone_number: '', national_id: '', password: '', confirm: '' });
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

  const incomplete = form.names.some((n) => !n.trim()) || !form.phone_number.trim() || form.password.length < 6;

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
        placeholder="+211900000000"
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
        label={t('Password (at least 6 characters)')}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoComplete="new-password"
      />
      <Field label={t('Confirm password')} value={form.confirm} onChangeText={set('confirm')} secureTextEntry />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button title={t('Create Account')} onPress={submit} loading={loading} disabled={incomplete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 14, fontWeight: '600', color: colors.text },
});
