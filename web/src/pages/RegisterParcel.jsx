import { useState } from 'react';
import api from '../api/client';

const initialForm = {
  gps_lat: '', gps_lng: '', neighbourhood: '', area_sqm: '',
  owner_full_name: '', owner_contact: '', document_type: '', national_id: '',
};

export default function RegisterParcel() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

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
      setResult(data);
      setForm(initialForm);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register parcel');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Register New Parcel</h2>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label>
            Neighbourhood
            <input value={form.neighbourhood} onChange={update('neighbourhood')} placeholder="e.g. Munuki" required />
          </label>
          <div style={{ display: 'flex', gap: 16 }}>
            <label style={{ flex: 1 }}>
              GPS Latitude
              <input value={form.gps_lat} onChange={update('gps_lat')} placeholder="4.8517" required />
            </label>
            <label style={{ flex: 1 }}>
              GPS Longitude
              <input value={form.gps_lng} onChange={update('gps_lng')} placeholder="31.5825" required />
            </label>
          </div>
          <label>
            Area (sqm)
            <input value={form.area_sqm} onChange={update('area_sqm')} placeholder="450" />
          </label>
          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #eee' }} />
          <label>
            Owner Full Name
            <input value={form.owner_full_name} onChange={update('owner_full_name')} required />
          </label>
          <label>
            Owner Contact Number
            <input value={form.owner_contact} onChange={update('owner_contact')} placeholder="+211..." />
          </label>
          <label>
            Document Type
            <input value={form.document_type} onChange={update('document_type')} placeholder="Sale Agreement / Inheritance / Grant" />
          </label>
          <label>
            National ID
            <input value={form.national_id} onChange={update('national_id')} placeholder="SS-1234567" />
          </label>
          {error && <div className="error-text">{error}</div>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Registering...' : 'Register Parcel + Generate QR'}
          </button>
        </form>
      </div>

      {result && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Parcel #{result.parcel_id} registered</h3>
          <p><strong>Owner:</strong> {result.owner_name}</p>
          <p><strong>Neighbourhood:</strong> {result.neighbourhood}</p>
          <div className="qr-box">
            <img src={result.qr_data_url} alt="Parcel QR Code" width={220} height={220} />
            <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#555' }}>
              Scan with the DLOVS mobile app or search parcel #{result.parcel_id} to verify.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
