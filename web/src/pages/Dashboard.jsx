import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { formatDateTime } from '../utils/format';
import { actionLabel } from '../utils/audit';

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
  const isAdmin = user?.role === 'administrator';

  return (
    <div>
      <h2>{t('Welcome, {name}', { name: user?.full_name })}</h2>
      {error && <div className="error-text">{error}</div>}

      <div className="stat-grid">
        <Stat label={t('Registered parcels')} value={stats?.parcels.total} to="/parcels/search" />
        <Stat label={t('Deactivated (fraud)')} value={stats?.parcels.deactivated} tone={stats?.parcels.deactivated ? 'danger' : undefined} />
        <Stat label={t('Your actions, last 7 days')} value={stats?.my_actions_7_days} to="/audit-log" />
      </div>

      <h3 className="section-title">{t('Waiting for an officer')}</h3>
      <div className="stat-grid">
        <Stat label={t('Documents to review')} value={stats?.pending_documents} to="/documents" tone={stats?.pending_documents ? 'warning' : undefined} />
        <Stat label={t('Open disputes')} value={stats?.open_disputes} to="/disputes" tone={stats?.open_disputes ? 'warning' : undefined} />
        <Stat label={t('Transfer requests')} value={stats?.pending_transfer_requests} to="/transfer-requests" tone={stats?.pending_transfer_requests ? 'warning' : undefined} />
        <Stat label={t('Unregistered plot reports')} value={stats?.open_reports} to="/reports" tone={stats?.open_reports ? 'warning' : undefined} />
        <Stat label={t('ID checks')} value={stats?.pending_id_checks} to="/id-checks" tone={stats?.pending_id_checks ? 'warning' : undefined} />
      </div>

      <div className="card">
        <h3>{t('Quick actions')}</h3>
        <div className="actions">
          {isOfficer && <Link className="btn" to="/parcels/new">{t('Register a Parcel')}</Link>}
          <Link className={`btn ${isOfficer ? 'secondary' : ''}`} to="/parcels/search">{t('Search / Verify')}</Link>
          <Link className="btn secondary" to="/documents">{t('Review Documents')}</Link>
          {isAdmin && <Link className="btn secondary" to="/admin">{t('Manage Accounts')}</Link>}
          {isAdmin && <Link className="btn secondary" to="/admin/reports">{t('Usage Reports')}</Link>}
        </div>
      </div>

      <div className="card">
        <h3>{isAdmin ? t('Recent activity (all officers)') : t('Your recent activity')}</h3>
        {stats && stats.recent_activity.length === 0 && <p className="muted">{t('No activity yet.')}</p>}
        {stats && stats.recent_activity.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t('Time')}</th>{isAdmin && <th>{t('Officer')}</th>}<th>{t('Action')}</th><th>{t('Parcel')}</th><th>{t('Details')}</th></tr></thead>
              <tbody>
                {stats.recent_activity.map((a) => (
                  <tr key={a.log_id}>
                    <td>{formatDateTime(a.timestamp)}</td>
                    {isAdmin && <td>{a.officer_name}</td>}
                    <td>{t(actionLabel(a.action_type))}</td>
                    <td>{a.parcel_id ? <Link to={`/parcels/${a.parcel_id}`}>#{a.parcel_id}</Link> : '—'}</td>
                    <td>{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
