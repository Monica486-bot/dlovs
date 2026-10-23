import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { api } from '../api/client';
import { useT } from '../i18n';
import { Banner, Button, Card, Field, Muted } from './ui';

// A transfer an owner asked to make to this citizen. The buyer accepts with a
// code sent to their phone (no officer needed) or declines.
export default function IncomingTransfer({ request, onDone }) {
  const { t } = useT();
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(t(err.message));
    } finally {
      setBusy(false);
    }
  }
  const askCode = () => run(async () => setSent(await api.post(`/transfer-requests/${request.request_id}/accept-code`)));
  const accept = () => run(async () => {
    await api.post(`/transfer-requests/${request.request_id}/accept`, { code: code.trim() });
    onDone();
  });
  const decline = () =>
    Alert.alert(t('Decline this transfer?'), '', [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Decline'), style: 'destructive', onPress: () => run(async () => {
        await api.put(`/transfer-requests/${request.request_id}/decline`, {});
        onDone();
      }) },
    ]);

  return (
    <Card>
      <Banner tone="info" title={t('{owner} wants to transfer parcel #{id} to you', { owner: request.requested_by_name, id: request.parcel_id })}>
        {t('Only accept after you have checked the plot and agreed the terms with the owner. Accepting registers the parcel to you straight away.')}
      </Banner>
      <Button
        title={t('Check the parcel record')}
        icon="document-text"
        variant="ghost"
        onPress={() => router.push({ pathname: '/parcel/[id]', params: { id: String(request.parcel_id) } })}
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {!sent ? (
        <>
          <Button title={t('Accept: send me a code')} icon="checkmark-done" onPress={askCode} loading={busy} />
          <Button title={t('Decline')} variant="ghost" onPress={decline} disabled={busy} />
        </>
      ) : (
        <>
          <Muted>{t('A code was sent to {phone}.', { phone: sent.sent_to })}</Muted>
          {sent.dev_code ? (
            <Banner tone="info" title={t('Demo mode')}>{t('SMS is not configured. Code: {code}', { code: sent.dev_code })}</Banner>
          ) : null}
          <Field label={t('Code')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          <Button title={t('Accept the transfer')} onPress={accept} loading={busy} disabled={code.trim().length !== 6} />
          <Button title={t('Send a new code')} variant="ghost" onPress={askCode} disabled={busy} />
        </>
      )}
    </Card>
  );
}
