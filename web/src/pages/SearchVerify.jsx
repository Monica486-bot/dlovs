import { useState } from 'react';
import api from '../api/client';

export default function SearchVerify() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setRecord(null);
    try {
      const { data } = await api.get('/parcels/search', { params: { query } });
      setResults(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed');
    }
  }

  async function viewRecord(parcelId) {
    setError('');
    try {
      const { data } = await api.get(`/parcels/${parcelId}/verify`);
      setRecord(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load record');
    }
  }

  return (
    <div>
      <h2>Search / Verify Parcel</h2>
      <p style={{ color: '#666', marginTop: -8 }}>
        This is the same lookup a Guest gets after scanning a parcel's QR code — no account required.
      </p>
      <div className="card">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by neighbourhood or parcel ID..."
            style={{ marginTop: 0 }}
          />
          <button className="btn" type="submit" style={{ whiteSpace: 'nowrap' }}>Search</button>
        </form>
      </div>

      {error && <div className="error-text">{error}</div>}

      {results.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr><th>Parcel ID</th><th>Neighbourhood</th><th>Owner</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {results.map((p) => (
                <tr key={p.parcel_id}>
                  <td>#{p.parcel_id}</td>
                  <td>{p.neighbourhood}</td>
                  <td>{p.owner_name}</td>
                  <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                  <td><button className="btn secondary" onClick={() => viewRecord(p.parcel_id)}>View Record</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {record && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ownership Record — Parcel #{record.parcel.parcel_id}</h3>
          <p><strong>Owner:</strong> {record.parcel.owner_name}</p>
          <p><strong>National ID:</strong> {record.parcel.national_id || '—'}</p>
          <p><strong>Neighbourhood:</strong> {record.parcel.neighbourhood}</p>
          <p><strong>Status:</strong> <span className={`badge ${record.parcel.status}`}>{record.parcel.status}</span></p>
          <p><strong>GPS:</strong> {record.parcel.gps_lat}, {record.parcel.gps_lng}</p>

          <h4>Ownership History</h4>
          {record.ownership_history.map((h) => (
            <div key={h.history_id} style={{ fontSize: '0.9rem', marginBottom: 6 }}>
              {h.previous_owner_name ? `${h.previous_owner_name} → ${h.new_owner_name}` : `Initial: ${h.new_owner_name}`}
              {' '}on {new Date(h.transfer_date).toLocaleDateString()}
            </div>
          ))}

          <h4>Open Disputes</h4>
          {record.disputes.length === 0 ? (
            <p style={{ color: '#666', fontSize: '0.9rem' }}>No disputes on record.</p>
          ) : (
            record.disputes.map((d) => (
              <div key={d.dispute_id} style={{ fontSize: '0.9rem' }}>
                {d.dispute_type} — <span className={`badge ${d.status}`}>{d.status}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
