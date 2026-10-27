import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { api, errorMessage } from '../api/client';
import { Banner, Button, Field, Muted, Screen } from '../components/ui';
import { useT } from '../i18n';
import type { CodeSent } from '../types';

// FR20: a citizen resets a forgotten password with an SMS code. Officer and
// administrator passwords are reset by an administrator.
export default function ForgotPassword() {
  const { t } = useT();
  const params = useLocalSearchParams<{ phone?: string }>();
  const [step, setStep] = useState('phone'); // phone | code
  const [phone, setPhone] = useState(params.phone || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [devCode, setDevCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function sendCode() {
    setLoading(true);
    setError('');
    try {
      const data = await api.post<CodeSent>('/auth/forgot-password', { phone_number: phone.trim() });
      if (data.staff) {
        setInfo(t('Land officer and administrator passwords are reset by a DLOVS administrator.'));
        return;
      }
      setDevCode(data.dev_code || '');
      setInfo(t('If this number has an account, we sent it a 6-digit code by SMS. It expires in 10 minutes.'));
      setStep('code');
    } catch (err) {
      setError(t(errorMessage(err)));
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    if (password !== confirm) {
      setError(t('Passwords do not match'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password-with-code', { phone_number: phone.trim(), code: code.trim(), new_password: password });
      router.replace({ pathname: '/login', params: { phone: phone.trim(), reset: '1' } });
    } catch (err) {
      setError(t(errorMessage(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Field
        label={t('Phone number')}
        value={phone}
        onChangeText={setPhone}
        placeholder="+211900000000"
        keyboardType="phone-pad"
        autoComplete="tel"
        editable={step === 'phone'}
      />
      {info ? <Banner tone="info">{info}</Banner> : null}
      {devCode ? (
        <Banner tone="info" title={t('Demo mode')}>
          {t('SMS is not configured. Code: {code}', { code: devCode })}
        </Banner>
      ) : null}
      {step === 'phone' ? (
        <Button title={t('Send Code')} onPress={sendCode} loading={loading} disabled={!phone.trim()} />
      ) : (
        <>
          <Field
            label={t('Code')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
          />
          <Field label={t('New password (at least 6 characters)')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <Field label={t('Confirm password')} value={confirm} onChangeText={setConfirm} secureTextEntry />
          <Button title={t('Reset Password')} onPress={reset} loading={loading} disabled={code.length !== 6 || password.length < 6} />
          <Button title={t('Send a New Code')} variant="secondary" onPress={sendCode} />
        </>
      )}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Muted>{t('Land officer and administrator passwords are reset by a DLOVS administrator.')}</Muted>
    </Screen>
  );
}
