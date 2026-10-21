import { useState } from 'react';
import { router } from 'expo-router';
import { api, ApiError } from '../api/client';
import { Banner, Button, Field, Muted, Screen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { getDeviceLocation } from '../utils/location';

// FR13: report a plot that isn't in DLOVS, so a land officer can follow up
// and register it.
export default function ReportPlot() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const [form, setForm] = useState({ neighbourhood: '', location_details: '', claimed_owner: '' });
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (key) => (value) => setForm({ ...form, [key]: value });

  if (!user) {
    return (
      <Screen>
        <Muted>{t('Log in to report a plot, so a land officer can follow up with you.')}</Muted>
        <Button title={t('Log In')} onPress={() => router.replace({ pathname: '/login', params: { returnTo: '/report-plot' } })} />
      </Screen>
    );
  }

  async function locate() {
    setLocating(true);
    setError('');
    const found = await getDeviceLocation();
    setLocating(false);
    if (found) setPosition(found);
    else setError(t('Could not get your location. Allow location access and try again outdoors.'));
  }

  async function submit() {
    setLoading(true);
    setError('');
    try {
      await api.post('/unregistered-reports', {
        neighbourhood: form.neighbourhood.trim(),
        location_details: form.location_details.trim(),
        claimed_owner: form.claimed_owner.trim() || undefined,
        gps_lat: position?.lat,
        gps_lng: position?.lng,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await logout();
        router.replace({ pathname: '/login', params: { returnTo: '/report-plot' } });
        return;
      }
      setError(t(err.message));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Banner tone="success" title={t('Report sent')}>
          {t("A land officer will follow up. You'll be notified of the outcome.")}
        </Banner>
        <Button title={t('Done')} onPress={() => router.dismissTo('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Muted>{t('Report a plot with no DLOVS record to a land officer.')}</Muted>
      <Field label={t('Neighbourhood')} value={form.neighbourhood} onChangeText={set('neighbourhood')} placeholder={t('e.g. Munuki')} />
      <Field
        label={t('Where exactly is it?')}
        value={form.location_details}
        onChangeText={set('location_details')}
        placeholder={t('Landmarks, road, block number…')}
        multiline
      />
      <Field label={t('Who claims to own it? (optional)')} value={form.claimed_owner} onChangeText={set('claimed_owner')} />
      <Button
        title={position ? t('Location added (±{n} m) — update', { n: Math.round(position.accuracy) }) : t('Add My Current Location')}
        variant="secondary"
        onPress={locate}
        loading={locating}
      />
      {position && position.accuracy > 10 ? (
        <Banner tone="warning">{t('Location accuracy is low - verify parcel boundaries manually.')}</Banner>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button
        title={t('Send Report')}
        onPress={submit}
        loading={loading}
        disabled={!form.neighbourhood.trim() || !form.location_details.trim()}
      />
    </Screen>
  );
}
