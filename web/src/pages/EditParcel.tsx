import { useEffect, useState } from 'react';
import type { ChangeEvent, SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import LocationButton from '../components/LocationButton';
import NeighbourhoodSelect from '../components/NeighbourhoodSelect';
import type { IdParams, Parcel, VerifyResult } from '../types';

interface EditForm {
  neighbourhood: string;
  gps_lat: string;
  gps_lng: string;
  area_sqm: string;
}

// FR03: LandOfficer updates a parcel's location details. Ownership changes go
// through Transfer Ownership instead, so they always leave a history entry.
export default function EditParcel() {
  const { id } = useParams<'id'>() as IdParams;
  const navigate = useNavigate();
  const { t } = useT();
  const [original, setOriginal] = useState<(EditForm & Pick<Parcel, 'status' | 'owner_name'>) | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get<VerifyResult>(`/parcels/${id}/verify`)
      .then(({ data }) => {
        if (cancelled) return;
        const p = data.parcel;
        const values: EditForm = {
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

  // used only once the parcel has loaded, when form and original are set
  const field = (name: keyof EditForm) => ({ value: form![name], onChange: (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form!, [name]: e.target.value }) });

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const changes = Object.fromEntries(Object.entries(form!).filter(([k, v]) => v !== original![k as keyof EditForm]));
      if (Object.keys(changes).length === 0) {
        setError(t('Nothing has changed.'));
        return;
      }
      await api.put(`/parcels/${id}`, changes);
      navigate(`/parcels/${id}`, { state: { flash: t('Parcel details updated.') } });
    } catch (err) {
      setError(errorMessage(err, t('Failed to update parcel')));
    } finally {
      setSaving(false);
    }
  }

  if (!form || !original) {
    return <div><h2>{t('Edit Parcel #{id}', { id })}</h2>{error ? <div className="error-text">{error}</div> : <p className="muted">{t('Loading…')}</p>}</div>;
  }

  return (
    <div>
      <p className="breadcrumb"><Link to={`/parcels/${id}`}>{t('← Parcel #{id}', { id })}</Link></p>
      <h2>{t('Edit Parcel #{id}', { id })}</h2>
      {original.status === 'deactivated' ? (
        <div className="notice danger"><span>{t('Deactivated records cannot be edited.')}</span></div>
      ) : (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            {t('Registered owner:')} <strong>{original.owner_name}</strong>
          </p>
          <form onSubmit={submit}>
            <NeighbourhoodSelect value={form.neighbourhood} onChange={(neighbourhood) => setForm({ ...form, neighbourhood })} />
            <div className="field-row">
              <label>{t('GPS Latitude')}<input {...field('gps_lat')} inputMode="decimal" required dir="ltr" /></label>
              <label>{t('GPS Longitude')}<input {...field('gps_lng')} inputMode="decimal" required dir="ltr" /></label>
            </div>
            <LocationButton onLocate={({ lat, lng }) => setForm({ ...form, gps_lat: lat.toFixed(7), gps_lng: lng.toFixed(7) })} />
            <label>{t('Parcel size (m²)')}<input {...field('area_sqm')} inputMode="decimal" /></label>
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
