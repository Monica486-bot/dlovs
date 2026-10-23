import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { formatDate } from '../../utils/format';
import FlagDispute from '../../components/FlagDispute';
import StatusBadge from '../../components/StatusBadge';
import { DisputesTable, HistoryTable, OwnerFacts, RecordWarnings } from '../../components/ParcelRecord';

// FR02 / FR07: the public ownership record; FR05 QR check via ?s=.
export default function PublicParcel() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const signature = searchParams.get('s') || undefined;
  const { t } = useT();
  const { user, isStaff } = useAuth();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api.get(`/parcels/${id}/verify`, { params: { signature } })
      .then(({ data }) => { setRecord(data); setError(''); })
      .catch((err) => {
        if (err.response?.status === 404) setError('not_found');
        else if (err.response?.data?.code === 'QR_INVALID') setError('invalid_qr');
        else setError(errorMessage(err, t('Failed to load parcel')));
      });
  }, [id, signature, t]);

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
  if (error === 'invalid_qr') {
    return (
      <div>
        <p className="breadcrumb"><Link to="/verify">{t('← Verify a Parcel')}</Link></p>
        <div className="notice danger">
          <strong>{t('This QR code is not genuine')}</strong>{' '}
          {t('This code does not match parcel #{id} and may be forged. Do not pay until a land officer has checked it.', { id })}
        </div>
        <Link className="btn secondary" to={`/verify/${id}`}>{t('View the registered record for parcel #{id}', { id })}</Link>
      </div>
    );
  }
  if (error) return <div className="error-text">{error}</div>;
  if (!record) return <p className="muted">{t('Loading…')}</p>;

  const { parcel, ownership_history: history, disputes, documents, qr_check: qrCheck, qr_issued_at: qrIssuedAt } = record;

  return (
    <div>
      <p className="breadcrumb"><Link to="/verify">{t('← Verify a Parcel')}</Link></p>
      <h2>{t('Parcel #{id}', { id: parcel.parcel_id })} <StatusBadge status={parcel.status} /></h2>
      {notice && <div className="notice success">{notice}</div>}
      {qrCheck === 'valid' && (
        <div className="notice success">
          <strong>{t('Genuine DLOVS QR code')}</strong> {t("This marker's code matches the one issued for parcel #{id}.", { id: parcel.parcel_id })}
        </div>
      )}
      {qrCheck === 'superseded' && (
        <div className="notice danger">
          <strong>{t('This QR code has been replaced')}</strong>{' '}
          {t('Ownership changed on {date}. Whoever shows this old marker may no longer own the plot. The current owner is shown below.', { date: formatDate(qrIssuedAt) })}
        </div>
      )}
      <RecordWarnings parcel={parcel} disputes={disputes} />

      <div className="detail-grid">
        <OwnerFacts parcel={parcel} documents={documents} ownerLink={isStaff ? `/owners/${parcel.current_owner_id}` : `/verify/owners/${parcel.current_owner_id}`} />
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
