import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import StatusBadge from '../components/StatusBadge';
import { DocumentTable, UploadDocument } from '../components/Documents';
import { DisputesTable, HistoryTable, OwnerFacts, RecordWarnings } from '../components/ParcelRecord';

export default function ParcelDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useT();
  const location = useLocation();
  const [record, setRecord] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [qr, setQr] = useState(location.state?.qrDataUrl || null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.flash || '');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rec, docs, reqs] = await Promise.all([
        api.get(`/parcels/${id}/verify`),
        api.get(`/parcels/${id}/documents`),
        api.get('/transfer-requests', { params: { status: 'pending' } }),
      ]);
      setRecord(rec.data);
      setDocuments(docs.data);
      setPendingRequest(reqs.data.find((r) => r.parcel_id === Number(id)) || null);
    } catch (err) {
      setError(errorMessage(err, t('Failed to load parcel')));
    }
  }, [id, t]);

  useEffect(() => { load(); }, [load]);

  async function showQr() {
    try {
      const { data } = await api.get(`/parcels/${id}/qr`);
      setQr(data.qr_data_url);
    } catch (err) {
      setError(errorMessage(err, t('Failed to load QR code')));
    }
  }

  const done = (msg) => { setNotice(msg); setUploading(false); load(); };

  if (error) return <div><h2>{t('Parcel #{id}', { id })}</h2><div className="error-text">{error}</div></div>;
  if (!record) return <div><h2>{t('Parcel #{id}', { id })}</h2><p className="muted">{t('Loading…')}</p></div>;

  const { parcel, ownership_history: history, disputes } = record;
  const isOfficer = user?.role === 'land_officer';
  const editable = parcel.status !== 'deactivated';
  const transferable = parcel.status === 'active';

  return (
    <div>
      <p className="breadcrumb no-print"><Link to="/parcels/search">{t('← Parcel Records')}</Link></p>
      <div className="page-header">
        <h2>{t('Parcel #{id}', { id: parcel.parcel_id })} <StatusBadge status={parcel.status} /></h2>
        <div className="actions no-print">
          {isOfficer && editable && <Link className="btn secondary" to={`/parcels/${id}/edit`}>{t('Edit Details')}</Link>}
          {isOfficer && (transferable ? (
            <Link className="btn" to={`/parcels/${id}/transfer${pendingRequest ? `?request=${pendingRequest.request_id}` : ''}`}>{t('Transfer Ownership')}</Link>
          ) : (
            <button className="btn" disabled title={parcel.status === 'disputed' ? t('Resolve open disputes first') : t('Deactivated record')}>
              {t('Transfer Ownership')}
            </button>
          ))}
          <button className="btn secondary" onClick={showQr}>{qr ? t('Refresh QR') : t('Show QR Code')}</button>
        </div>
      </div>

      {notice && <div className="notice success no-print">{notice}</div>}
      <div className="no-print"><RecordWarnings parcel={parcel} disputes={disputes} /></div>
      {pendingRequest && (
        <div className="notice info no-print">
          <span>{t('Transfer requested to {buyer}', { buyer: pendingRequest.buyer_full_name })} · <Link to="/transfer-requests">{t('View request')}</Link></span>
        </div>
      )}

      <div className="detail-grid">
        <div className="no-print">
          <OwnerFacts parcel={parcel} documents={documents} ownerLink={`/owners/${parcel.current_owner_id}`} />
        </div>
        {qr && (
          <div className="card qr-card print-area">
            <h3>{t('Verification QR Code')}</h3>
            <img src={qr} alt={t('QR code for parcel {id}', { id: parcel.parcel_id })} width={220} height={220} />
            <p className="print-caption">
              {t('DLOVS Parcel #{id}', { id: parcel.parcel_id })} · {parcel.neighbourhood}
            </p>
            <button className="btn no-print" onClick={() => window.print()}>{t('Print')}</button>
          </div>
        )}
      </div>

      <div className="card no-print">
        <div className="page-header">
          <h3 style={{ margin: 0 }}>{t('Documents')}</h3>
          {isOfficer && editable && !uploading && (
            <button className="btn secondary" onClick={() => setUploading(true)}>{t('Upload Document')}</button>
          )}
        </div>
        {uploading && <UploadDocument parcelId={parcel.parcel_id} onUploaded={done} onBehalf />}
        <DocumentTable documents={documents} onChanged={done} />
      </div>

      <div className="no-print">
        <HistoryTable history={history} />
        <DisputesTable disputes={disputes} />
      </div>
    </div>
  );
}
