import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useT } from '../../i18n';
import LocationButton from '../../components/LocationButton';

// FR13: report a plot that isn't in DLOVS so an officer can follow up.
const EMPTY = { neighbourhood: '', location_details: '', claimed_owner: '', gps_lat: '', gps_lng: '' };

export default function ReportPlot() {
  const { t } = useT();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/unregistered-reports', form);
      setSent(true);
      setForm(EMPTY);
    } catch (err) {
      setError(errorMessage(err, t('Failed to submit report')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2>{t('Report a plot that is not registered')}</h2>
      <p className="muted">
        {t('Someone is selling a plot that has no DLOVS record, or you own land that is not registered yet? Tell a land officer where it is. They will follow up and let you know what happened.')}
      </p>
      {sent && (
        <div className="notice success">
          {t('Report sent. You can follow it under')} <Link to="/my/requests">{t('My Requests')}</Link>.
        </div>
      )}
      <form className="card" onSubmit={submit}>
        <label>{t('Neighbourhood')}<input {...field('neighbourhood')} placeholder={t('e.g. Gudele Block 3')} required /></label>
        <label>
          {t('Where exactly is it?')}
          <textarea {...field('location_details')} rows={3} required placeholder={t('Landmarks, the nearest road, what is on the plot')} />
        </label>
        <label>
          {t('Who says they own it? (optional)')}
          <input {...field('claimed_owner')} placeholder={t('Name of the seller or occupant, if known')} />
        </label>
        <div className="field-row">
          <label>{t('GPS Latitude (optional)')}<input {...field('gps_lat')} inputMode="decimal" dir="ltr" /></label>
          <label>{t('GPS Longitude (optional)')}<input {...field('gps_lng')} inputMode="decimal" dir="ltr" /></label>
        </div>
        <LocationButton onLocate={({ lat, lng }) => setForm({ ...form, gps_lat: lat.toFixed(6), gps_lng: lng.toFixed(6) })} />
        {error && <div className="error-text">{error}</div>}
        <button className="btn" type="submit" disabled={saving}>{saving ? t('Sending…') : t('Send Report')}</button>
      </form>
    </div>
  );
}
