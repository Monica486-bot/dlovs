import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../api/client';
import { Banner, Button, Field, Muted, Screen } from '../components/ui';
import { useT } from '../i18n';

// FR01: confirm the phone number with the 6-digit SMS code before logging in.
export default function VerifyPhone() {
  const params = useLocalSearchParams();
  const { t } = useT();
  const [phone, setPhone] = useState(params.phone || '');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(params.devCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit() {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/verify-phone', { phone_number: phone.trim(), code: code.trim() });
      router.replace({ pathname: '/login', params: { phone: phone.trim(), verified: '1', returnTo: params.returnTo || '' } });
    } catch (err) {
      setError(t(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError('');
    setInfo('');
    try {
      const data = await api.post('/auth/resend-code', { phone_number: phone.trim() });
      setDevCode(data.dev_code || '');
      setInfo(t('A new code has been sent.'));
    } catch (err) {
      setError(t(err.message));
    }
  }

  return (
    <Screen>
      <Muted>{t('We sent a 6-digit code by SMS. It expires in 10 minutes.')}</Muted>
      {devCode ? (
        <Banner tone="info" title={t('Demo mode')}>
          {t('SMS is not configured. Code: {code}', { code: devCode })}
        </Banner>
      ) : null}
      <Field label={t('Phone number')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field
        label={t('Code')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {info ? <Banner tone="success">{info}</Banner> : null}
      <Button title={t('Confirm')} onPress={submit} loading={loading} disabled={code.length !== 6 || !phone.trim()} />
      <Button title={t('Send a New Code')} variant="secondary" onPress={resend} disabled={!phone.trim()} />
    </Screen>
  );
}
