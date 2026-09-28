import { useEffect, useState } from 'react';
import api from '../api/client';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/audit-logs').then((res) => setLogs(res.data)).catch((err) => setError(err.response?.data?.error || 'Failed to load logs'));
  }, []);

  return (
    <div>
      <h2>Audit Log</h2>
      <p style={{ color: '#666', marginTop: -8 }}>Every officer action — parcel creation, transfers, dispute resolution — is recorded here for accountability.</p>
      {error && <div className="error-text">{error}</div>}
      <div className="card">
        <table>
          <thead>
            <tr><th>Time</th><th>Officer</th><th>Action</th><th>Parcel</th><th>Details</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.log_id}>
                <td>{new Date(l.timestamp).toLocaleString()}</td>
                <td>{l.officer_name}</td>
                <td>{l.action_type.replace('_', ' ')}</td>
                <td>#{l.parcel_id}</td>
                <td>{l.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
