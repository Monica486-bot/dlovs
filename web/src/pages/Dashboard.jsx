import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { formatRelative } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useT();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get('/parcels/stats')
      .then(({ data }) => { if (!cancelled) setStats(data); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, t('Failed to load dashboard'))); });
    return () => { cancelled = true; };
  }, [t]);

  const isOfficer = user?.role === 'land_officer';

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('Dashboard')}</h2>
          <p className="page-subtitle">{t('Juba land register')}</p>
        </div>
        {isOfficer && <Link className="btn" to="/parcels/new">{t('Register Parcel')}</Link>}
      </div>
      {error && <div className="error-text">{error}</div>}

      <div className="stat-grid">
        <Stat label={t('Total Parcels')} value={stats?.parcels.total} to="/parcels/search" />
        <Stat label={t('Documents to Review')} value={stats?.pending_documents} to="/documents" tone="warning" />
        <Stat label={t('Active Disputes')} value={stats?.open_disputes} to="/disputes" tone="danger" />
        <Stat label={t('Transfer Requests')} value={stats?.pending_transfer_requests} to="/transfer-requests" tone="success" />
      </div>

      {stats && (stats.pending_id_checks > 0 || stats.open_reports > 0) && (
        <div className="actions" style={{ marginBottom: 20 }}>
          {stats.pending_id_checks > 0 && <Link className="view-link" to="/id-checks">{t('{n} ID check(s) waiting →', { n: stats.pending_id_checks })}</Link>}
          {stats.open_reports > 0 && <Link className="view-link" to="/reports">{t('{n} unregistered plot report(s) →', { n: stats.open_reports })}</Link>}
        </div>
      )}

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>{t('Parcel ID')}</th><th>{t('Owner')}</th><th>{t('Location')}</th><th>{t('Status')}</th><th>{t('Last Updated')}</th><th></th></tr>
            </thead>
            <tbody>
              {stats?.recent_parcels?.map((p) => (
                <tr key={p.parcel_id}>
                  <td>#{p.parcel_id}</td>
                  <td>{p.owner_name}</td>
                  <td>{p.neighbourhood}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>{formatRelative(p.updated_at)}</td>
                  <td><Link className="view-link" to={`/parcels/${p.parcel_id}`}>{t('View →')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stats && !stats.recent_parcels?.length && <p className="muted">{t('No parcels registered yet.')}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, to, tone }) {
  const body = (
    <>
      <span className="stat-value">{value ?? '…'}</span>
      <span className="stat-label">{label}</span>
    </>
  );
  const className = `stat ${tone ? `stat-${tone}` : ''}`;
  return to ? <Link className={className} to={to}>{body}</Link> : <div className={className}>{body}</div>;
}
