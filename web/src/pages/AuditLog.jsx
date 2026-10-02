import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { formatDateTime } from '../utils/format';
import { ACTION_LABELS, actionLabel } from '../utils/audit';

// FR14: officer audit trail. The database refuses to change or delete entries.
export default function AuditLog() {
  const { user } = useAuth();
  const { t } = useT();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [hideViews, setHideViews] = useState(true);

  useEffect(() => {
    api.get('/audit-logs').then((res) => setLogs(res.data)).catch((err) => setError(errorMessage(err, t('Failed to load logs'))));
  }, [t]);

  const shown = logs.filter((l) => (action ? l.action_type === action : !(hideViews && l.action_type === 'VERIFY_PARCEL')));
  const isAdmin = user?.role === 'administrator';

  return (
    <div>
      <h2>{isAdmin ? t('System Audit Logs') : t('My Audit Log')}</h2>
      <p className="page-subtitle">
        {isAdmin ? t('Every officer action across the platform, permanently logged') : t('Every action you take is permanently logged and reviewable by administrators')}
      </p>
      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <div className="filter-bar">
          <label>
            {t('Action')}
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">{t('All actions')}</option>
              {Object.entries(ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
            </select>
          </label>
          {!action && (
            <label className="checkbox">
              <input type="checkbox" checked={hideViews} onChange={(e) => setHideViews(e.target.checked)} />
              {t('Hide record views')}
            </label>
          )}
          <span className="muted">{t('{shown} of {total} entries', { shown: shown.length, total: logs.length })}</span>
        </div>

        {shown.length === 0 ? (
          <p className="muted">{t('No entries match.')}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>{t('Timestamp')}</th><th>{t('Officer')}</th><th>{t('Action')}</th><th>{t('Parcel ID')}</th><th>{t('Details')}</th></tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.log_id}>
                    <td>{formatDateTime(l.timestamp)}</td>
                    <td>{l.officer_name || <span className="muted">{t('Public (no account)')}</span>}</td>
                    <td>{t(actionLabel(l.action_type))}</td>
                    <td>{l.parcel_id ? <Link to={`/parcels/${l.parcel_id}`}>#{l.parcel_id}</Link> : '—'}</td>
                    <td>{l.details}</td>
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
