import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import LocationButton from '../components/LocationButton';

// FR03: LandOfficer updates a parcel's location details. Ownership changes go
// through Transfer Ownership instead, so they always leave a history entry.
export default function EditParcel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/parcels/${id}/verify`)
      .then(({ data }) => {
        if (cancelled) return;
        const p = data.parcel;
        const values = {
          neighbourhood: p.neighbourhood,
          gps_lat: String(Number(p.gps_lat)),
          gps_lng: String(Number(p.gps_lng)),
          area_sqm: p.area_sqm ? String(Number(p.area_sqm)) : '',
        };
        setOriginal({ ...values, status: p.status, owner_name: p.owner_name });
        setForm(values);
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, t('Failed to load parcel'))); });
    return () => { cancelled = true; };
  }, [id, t]);

  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const changes = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== original[k]));
      if (Object.keys(changes).length === 0) {
        setError(t('Nothing has changed.'));
        return;
      }
      await api.put(`/parcels/${id}`, changes);
      navigate(`/parcels/${id}`, { state: { flash: t('Parcel details updated. The change is recorded in the audit log.') } });
    } catch (err) {
      setError(errorMessage(err, t('Failed to update parcel')));
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return <div><h2>{t('Edit Parcel #{id}', { id })}</h2>{error ? <div className="error-text">{error}</div> : <p className="muted">{t('Loading…')}</p>}</div>;
  }

  return (
    <div>
      <p className="breadcrumb"><Link to={`/parcels/${id}`}>{t('← Parcel #{id}', { id })}</Link></p>
      <h2>{t('Edit Parcel #{id}', { id })}</h2>
      {original.status === 'deactivated' ? (
        <div className="notice danger">{t('Deactivated parcel records cannot be edited.')}</div>
      ) : (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            {t('Registered owner:')} <strong>{original.owner_name}</strong>. {t('To change the owner, use')}{' '}
            <Link to={`/parcels/${id}/transfer`}>{t('Transfer Ownership')}</Link>.
          </p>
          <form onSubmit={submit}>
            <label>{t('Neighbourhood')}<input {...field('neighbourhood')} required /></label>
            <div className="field-row">
              <label>{t('GPS Latitude')}<input {...field('gps_lat')} inputMode="decimal" required dir="ltr" /></label>
              <label>{t('GPS Longitude')}<input {...field('gps_lng')} inputMode="decimal" required dir="ltr" /></label>
            </div>
            <LocationButton onLocate={({ lat, lng }) => setForm({ ...form, gps_lat: lat.toFixed(7), gps_lng: lng.toFixed(7) })} />
            <label>{t('Area (m²)')}<input {...field('area_sqm')} inputMode="decimal" /></label>
            {error && <div className="error-text">{error}</div>}
            <div className="actions">
              <button className="btn" type="submit" disabled={saving}>{saving ? t('Saving…') : t('Save Changes')}</button>
              <Link className="btn secondary" to={`/parcels/${id}`}>{t('Cancel')}</Link>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
