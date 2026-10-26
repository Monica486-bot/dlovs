import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { safeReturnTo } from '../utils/navigation';
import { Banner, Button, Field, Muted, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { useT } from '../i18n';

export default function Login() {
  const { login } = useAuth();
  const { t } = useT();
  const { returnTo, phone: phoneParam, verified, reset } = useLocalSearchParams();
  const [phone, setPhone] = useState(phoneParam || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setLoading(true);
    setError('');
    try {
      await login(phone.trim(), password);
      // back to the screen that asked for a login; dismissTo replaces this
      // screen instead when that screen isn't in the stack (e.g. a deep link)
      router.dismissTo(safeReturnTo(returnTo));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PHONE_NOT_VERIFIED') {
        router.push({ pathname: '/verify-phone', params: { phone: phone.trim(), returnTo: returnTo || '' } });
        return;
      }
      setError(t(err.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      {verified ? <Banner tone="success">{t('Phone number confirmed. You can now log in.')}</Banner> : null}
      {reset ? <Banner tone="success">{t('Password reset. You can now log in.')}</Banner> : null}
      <Field
        label={t('Phone number')}
        value={phone}
        onChangeText={setPhone}
        placeholder="+211900000000"
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Field
        label={t('Password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button title={t('Log In')} onPress={submit} loading={loading} disabled={!phone.trim() || !password} />
      <Button
        title={t('Forgot Password?')}
        variant="secondary"
        onPress={() => router.push({ pathname: '/forgot-password', params: phone.trim() ? { phone: phone.trim() } : {} })}
      />
      <Muted>{t('No account yet?')}</Muted>
      <Button title={t('Create Account')} variant="secondary" onPress={() => router.replace({ pathname: '/register', params: returnTo ? { returnTo } : {} })} />
    </Screen>
  );
}
