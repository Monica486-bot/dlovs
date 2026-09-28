import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Disputes() {
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/disputes');
      setDisputes(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load disputes');
    }
  }

  useEffect(() => { load(); }, []);

  async function resolve(id) {
    const notes = window.prompt('Resolution notes:');
    if (notes === null) return;
    try {
      await api.put(`/disputes/${id}/resolve`, { resolution_notes: notes });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resolve dispute');
    }
  }

  return (
    <div>
      <h2>Disputes</h2>
      {error && <div className="error-text">{error}</div>}
      <div className="card">
        {disputes.length === 0 ? (
          <p style={{ color: '#666' }}>No open disputes. 🎉</p>
        ) : (
          <table>
            <thead>
              <tr><th>Parcel</th><th>Type</th><th>Reported</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {disputes.map((d) => (
                <tr key={d.dispute_id}>
                  <td>#{d.parcel_id} — {d.neighbourhood}</td>
                  <td>{d.dispute_type}</td>
                  <td>{new Date(d.created_at).toLocaleDateString()}</td>
                  <td><span className={`badge ${d.status}`}>{d.status.replace('_', ' ')}</span></td>
                  <td><button className="btn" onClick={() => resolve(d.dispute_id)}>Resolve</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
