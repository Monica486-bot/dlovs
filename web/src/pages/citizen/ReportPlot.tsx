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
      <h2>{t('Report a Plot')}</h2>
      <p className="page-subtitle">{t('Tell a land officer about a plot that is not registered.')}</p>
      {sent && (
        <div className="notice success">
          <span>{t('Report sent.')} <Link to="/my/requests">{t('View in My Requests')}</Link></span>
        </div>
      )}
      <form className="card" onSubmit={submit}>
        <label>{t('Neighbourhood')}<input {...field('neighbourhood')} required /></label>
        <label>
          {t('Location details')}
          <textarea {...field('location_details')} rows={3} required />
        </label>
        <label>
          {t('Claimed owner (optional)')}
          <input {...field('claimed_owner')} />
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
