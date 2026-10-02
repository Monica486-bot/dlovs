import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import LocationButton from '../components/LocationButton';

const initialForm = {
  gps_lat: '', gps_lng: '', neighbourhood: '', area_sqm: '',
  owner_full_name: '', owner_contact: '', document_type: '', national_id: '',
};

// FR03 / FR04 / FR05: LandOfficer.createParcelRecord(data) — registers the
// parcel and generates its signed QR code.
export default function RegisterParcel() {
  const { t } = useT();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/parcels', {
        gps_lat: parseFloat(form.gps_lat),
        gps_lng: parseFloat(form.gps_lng),
        neighbourhood: form.neighbourhood,
        area_sqm: form.area_sqm ? parseFloat(form.area_sqm) : null,
        owner: {
          full_name: form.owner_full_name,
          contact_number: form.owner_contact,
          document_type: form.document_type,
          national_id: form.national_id,
        },
      });
      navigate(`/parcels/${data.parcel_id}`, {
        state: {
          qrDataUrl: data.qr_data_url,
          flash: t('Parcel #{id} registered for {name}. Print the QR code below for the plot marker.', { id: data.parcel_id, name: data.owner_name }),
        },
      });
    } catch (err) {
      setError(errorMessage(err, t('Failed to register parcel')));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>{t('Register New Parcel')}</h2>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <h3>{t('The plot')}</h3>
          <label>{t('Neighbourhood')}<input {...field('neighbourhood')} placeholder={t('e.g. Munuki')} required /></label>
          <div className="field-row">
            <label>{t('GPS Latitude')}<input {...field('gps_lat')} placeholder="4.8517" inputMode="decimal" required dir="ltr" /></label>
            <label>{t('GPS Longitude')}<input {...field('gps_lng')} placeholder="31.5825" inputMode="decimal" required dir="ltr" /></label>
          </div>
          <LocationButton onLocate={({ lat, lng }) => setForm({ ...form, gps_lat: lat.toFixed(7), gps_lng: lng.toFixed(7) })} />
          <label>{t('Area (m²)')}<input {...field('area_sqm')} placeholder="450" inputMode="decimal" /></label>

          <h3>{t('The owner')}</h3>
          <label>{t('Owner Full Name')}<input {...field('owner_full_name')} required /></label>
          <div className="field-row">
            <label>
              {t('National ID')}
              <input {...field('national_id')} placeholder="SS-1234567" />
              <span className="hint">{t('Links the parcel to the owner\'s other parcels and to their DLOVS account.')}</span>
            </label>
            <label>{t('Owner Contact Number')}<input {...field('owner_contact')} placeholder="+211…" dir="ltr" /></label>
          </div>
          <label>{t('Document Type')}<input {...field('document_type')} placeholder={t('Sale Agreement / Inheritance / Grant')} /></label>
          {error && <div className="error-text">{error}</div>}
          <button className="btn" type="submit" disabled={loading}>{loading ? t('Registering…') : t('Register Parcel + Generate QR')}</button>
        </form>
      </div>
    </div>
  );
}
