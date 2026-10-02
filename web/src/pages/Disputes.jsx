import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

export default function Disputes() {
  const { user } = useAuth();
  const { t } = useT();
  const [disputes, setDisputes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(null);
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/disputes');
      setDisputes(data);
    } catch (err) {
      setError(errorMessage(err, t('Failed to load disputes')));
    } finally {
      setLoaded(true);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function resolve(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/disputes/${resolving.dispute_id}/resolve`, { resolution_notes: notes.trim() });
      setSuccess(t('Dispute on parcel #{id} resolved and recorded in the audit log. The people involved have been notified.', { id: resolving.parcel_id }));
      setResolving(null);
      setNotes('');
      load();
    } catch (err) {
      setError(errorMessage(err, t('Failed to resolve dispute')));
    }
  }

  const canResolve = user?.role === 'land_officer';

  return (
    <div>
      <h2>{t('Disputes')}</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        {t('Disputes flagged by citizens on the web or in the mobile app. A disputed parcel shows a warning to everyone who checks it and cannot be transferred until every dispute on it is resolved.')}
      </p>
      {error && <div className="error-text">{error}</div>}
      {success && <div className="notice success">{success}</div>}

      {loaded && disputes.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>{t('No open disputes.')}</p></div>}

      {disputes.map((d) => (
        <div className="card dispute" key={d.dispute_id}>
          <div className="page-header">
            <h3 style={{ margin: 0 }}>
              <Link to={`/parcels/${d.parcel_id}`}>{t('Parcel #{id}', { id: d.parcel_id })}</Link> · {d.neighbourhood}{' '}
              <StatusBadge status={d.status} label={`${t(d.dispute_type)} · ${t(d.status.replace('_', ' '))}`} />
            </h3>
            {canResolve && resolving?.dispute_id !== d.dispute_id && (
              <button className="btn" onClick={() => { setResolving(d); setNotes(''); setSuccess(''); }}>{t('Resolve')}</button>
            )}
          </div>
          <p className="dispute-description">{d.description || <span className="muted">{t('No description given.')}</span>}</p>
          <p className="muted" style={{ margin: 0 }}>
            {t('Registered owner: {owner} · Reported {date} by {name}', { owner: d.owner_name, date: formatDate(d.created_at), name: d.reporter_name || t('unknown') })}
            {d.reporter_phone && <> (<span dir="ltr">{d.reporter_phone}</span>)</>}
            {' · '}{d.reported_via === 'web' ? t('via the website') : t('via the mobile app')}
          </p>

          {resolving?.dispute_id === d.dispute_id && (
            <form onSubmit={resolve} className="resolve-form">
              <label>
                {t('How was it resolved?')}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  required
                  minLength={10}
                  placeholder={t('e.g. Both parties met at the land office; boundary re-measured and fence restored.')}
                />
              </label>
              <div className="actions">
                <button className="btn" type="submit">{t('Mark Resolved')}</button>
                <button className="btn secondary" type="button" onClick={() => setResolving(null)}>{t('Cancel')}</button>
              </div>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
