import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { formatDate } from '../../utils/format';
import FlagDispute from '../../components/FlagDispute';
import StatusBadge from '../../components/StatusBadge';
import { DisputesTable, HistoryTable, OwnerFacts, RecordWarnings } from '../../components/ParcelRecord';

// FR02 / FR07: the public ownership record. Identity documents and QR
// signatures are never sent here; documents show only their review status.
export default function PublicParcel() {
  const { id } = useParams();
  const { t } = useT();
  const { user, isStaff } = useAuth();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api.get(`/parcels/${id}/verify`)
      .then(({ data }) => { setRecord(data); setError(''); })
      .catch((err) => setError(err.response?.status === 404 ? 'not_found' : errorMessage(err, t('Failed to load parcel'))));
  }, [id, t]);

  useEffect(() => { load(); }, [load]);

  if (error === 'not_found') {
    return (
      <div>
        <p className="breadcrumb"><Link to="/verify">{t('← Verify a Parcel')}</Link></p>
        <div className="notice warning">
          <strong>{t('Not registered')}</strong> {t('There is no DLOVS record for parcel #{id}.', { id })}{' '}
          {user && !isStaff ? <Link to="/my/report">{t('Report this plot')}</Link> : !user && <Link to="/login?next=/my/report">{t('Report this plot')}</Link>}
        </div>
      </div>
    );
  }
  if (error) return <div className="error-text">{error}</div>;
  if (!record) return <p className="muted">{t('Loading…')}</p>;

  const { parcel, ownership_history: history, disputes, documents } = record;

  return (
    <div>
      <p className="breadcrumb"><Link to="/verify">{t('← Verify a Parcel')}</Link></p>
      <h2>{t('Parcel #{id}', { id: parcel.parcel_id })} <StatusBadge status={parcel.status} /></h2>
      {notice && <div className="notice success">{notice}</div>}
      <RecordWarnings parcel={parcel} disputes={disputes} />

      <div className="detail-grid">
        <OwnerFacts parcel={parcel} documents={documents} ownerLink={isStaff ? `/owners/${parcel.current_owner_id}` : null} />
        <div className="card">
          <h3>{t('Documents on file')}</h3>
          {documents.length === 0 ? (
            <p className="muted">{t('No documents on file.')}</p>
          ) : (
            <ul className="plain-list">
              {documents.map((d) => (
                <li key={d.document_id}>
                  <strong>{t(d.document_type || 'Other')}</strong> · {formatDate(d.upload_date)} <StatusBadge status={d.verification_status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <HistoryTable history={history} />
      <DisputesTable disputes={disputes} />

      {parcel.status !== 'deactivated' && (
        <div className="card">
          <h3>{t('Report a problem')}</h3>
          {user && !isStaff && <FlagDispute parcelId={parcel.parcel_id} onFlagged={(msg) => { setNotice(msg); load(); }} />}
          {!user && (
            <div className="actions">
              <Link className="btn danger" to={`/login?next=/verify/${parcel.parcel_id}`}>{t('Log in to flag a dispute')}</Link>
            </div>
          )}
          {isStaff && <Link className="btn secondary" to={`/parcels/${parcel.parcel_id}`}>{t('Open in Staff Portal')}</Link>}
        </div>
      )}
    </div>
  );
}
