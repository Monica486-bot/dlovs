import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

// Owners' requests to transfer a parcel. Processing opens the normal transfer
// screen pre-filled with the buyer; nothing changes until that is confirmed.
export default function TransferRequests() {
  const { t } = useT();
  const { user } = useAuth();
  const [status, setStatus] = useState('pending');
  const [requests, setRequests] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api.get('/transfer-requests', { params: { status } })
      .then(({ data }) => { setRequests(data); setError(''); })
      .catch((err) => setError(errorMessage(err, t('Failed to load transfer requests'))));
  }, [status, t]);

  useEffect(() => { load(); }, [load]);

  async function reject(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/transfer-requests/${rejecting}/reject`, { response_notes: notes.trim() });
      setNotice(t('Request rejected.'));
      setRejecting(null);
      load();
    } catch (err) {
      setError(errorMessage(err, t('Failed to reject request')));
    }
  }

  const isOfficer = user?.role === 'land_officer';

  return (
    <div>
      <h2>{t('Transfers')}</h2>
      <p className="page-subtitle">{t('Transfer requests from parcel owners')}</p>
      <div className="tabs" role="tablist">
        {['pending', 'completed', 'rejected'].map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className={status === s ? 'active' : ''} onClick={() => { setStatus(s); setNotice(''); }}>{t(s)}</button>
        ))}
      </div>
      {error && <div className="error-text">{error}</div>}
      {notice && <div className="notice success">{notice}</div>}
      {requests?.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>{t('No requests here.')}</p></div>}

      {requests?.map((r) => (
        <div className="card" key={r.request_id}>
          <div className="page-header">
            <h3 style={{ margin: 0 }}>
              <Link to={`/parcels/${r.parcel_id}`}>{t('Parcel #{id}', { id: r.parcel_id })}</Link> · {r.neighbourhood} <StatusBadge status={r.status} />
            </h3>
            {isOfficer && r.status === 'pending' && rejecting !== r.request_id && (
              <div className="actions">
                {r.parcel_status === 'active' ? (
                  <Link className="btn" to={`/parcels/${r.parcel_id}/transfer?request=${r.request_id}`}>{t('Approve Transfer')}</Link>
                ) : (
                  <button className="btn" disabled title={t('The parcel is {status}', { status: t(r.parcel_status) })}>{t('Process Transfer')}</button>
                )}
                <button className="btn danger" onClick={() => { setRejecting(r.request_id); setNotes(''); }}>{t('Reject Transfer')}</button>
              </div>
            )}
          </div>
          <dl className="facts compact">
            <dt>{t('Current Owner')}</dt><dd>{r.owner_name}</dd>
            <dt>{t('New Owner')}</dt><dd>{r.buyer_full_name} · {r.buyer_national_id}{r.buyer_contact && <> · <span dir="ltr">{r.buyer_contact}</span></>}</dd>
            <dt>{t('Requested')}</dt><dd>{formatDate(r.created_at)}</dd>
            {r.notes && (<><dt>{t('Note')}</dt><dd>{r.notes}</dd></>)}
            {r.status !== 'pending' && (<><dt>{t('Handled')}</dt><dd>{r.handled_by_name}, {formatDate(r.handled_at)}{r.response_notes && ` — ${r.response_notes}`}</dd></>)}
          </dl>
          {r.status === 'pending' && r.parcel_status !== 'active' && (
            <p className="warning-text" style={{ marginBottom: 0 }}>{t('Parcel is {status}', { status: t(r.parcel_status) })}</p>
          )}
          {rejecting === r.request_id && (
            <form onSubmit={reject} className="resolve-form">
              <label>
                {t('Reason')}
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} required />
              </label>
              <div className="actions">
                <button className="btn danger" type="submit">{t('Reject Request')}</button>
                <button className="btn secondary" type="button" onClick={() => setRejecting(null)}>{t('Cancel')}</button>
              </div>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
