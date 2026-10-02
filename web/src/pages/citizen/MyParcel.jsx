import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useT } from '../../i18n';
import { formatDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import FlagDispute from '../../components/FlagDispute';
import { DocumentTable, UploadDocument } from '../../components/Documents';
import { DisputesTable, HistoryTable, OwnerFacts, RecordWarnings } from '../../components/ParcelRecord';

// The owner's view of one parcel: documents (FR10), transfer request, disputes.
export default function MyParcel() {
  const { id } = useParams();
  const { t } = useT();
  const [record, setRecord] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [rec, docs, reqs] = await Promise.all([
        api.get(`/parcels/${id}/verify`),
        api.get(`/parcels/${id}/documents`),
        api.get('/transfer-requests', { params: { status: 'all' } }),
      ]);
      setRecord(rec.data);
      setDocuments(docs.data);
      setRequests(reqs.data.filter((r) => r.parcel_id === Number(id)));
      setError('');
    } catch (err) {
      setError(err.response?.status === 403 ? 'not_owner' : errorMessage(err, t('Failed to load parcel')));
    }
  }, [id, t]);

  useEffect(() => { load(); }, [load]);

  const done = (msg) => { setNotice(msg); load(); window.scrollTo(0, 0); };

  if (error === 'not_owner') {
    return (
      <div className="notice warning">
        {t('This parcel is not registered to your national ID.')} <Link to={`/verify/${id}`}>{t('View the public record')}</Link>
      </div>
    );
  }
  if (error) return <div className="error-text">{error}</div>;
  if (!record) return <p className="muted">{t('Loading…')}</p>;

  const { parcel, ownership_history: history, disputes } = record;
  const pending = requests.find((r) => r.status === 'pending');

  return (
    <div>
      <p className="breadcrumb"><Link to="/my">{t('← My Parcels')}</Link></p>
      <h2>{t('Parcel #{id}', { id: parcel.parcel_id })} <StatusBadge status={parcel.status} /></h2>
      {notice && <div className="notice success">{notice}</div>}
      <RecordWarnings parcel={parcel} disputes={disputes} />

      <OwnerFacts parcel={parcel} documents={documents} />

      <div className="card">
        <h3>{t('My documents')}</h3>
        <DocumentTable documents={documents} onChanged={done} />
        {parcel.status !== 'deactivated' && (
          <>
            <h4 style={{ marginBottom: 8 }}>{t('Upload Document')}</h4>
            <UploadDocument parcelId={parcel.parcel_id} onUploaded={done} />
          </>
        )}
      </div>

      <div className="card">
        <h3>{t('Transfer Ownership')}</h3>
        {pending ? (
          <p style={{ margin: 0 }}>{t('Transfer to {buyer} requested on {date}', { buyer: pending.buyer_full_name, date: formatDate(pending.created_at) })} <StatusBadge status="pending" /></p>
        ) : parcel.status === 'active' ? (
          <TransferRequestForm parcelId={parcel.parcel_id} onSent={done} />
        ) : (
          <p className="muted" style={{ margin: 0 }}>{t('Not available while {status}.', { status: t(parcel.status) })}</p>
        )}
        {requests.filter((r) => r.status !== 'pending').map((r) => (
          <p key={r.request_id} className="muted small">
            {t('Request to transfer to {buyer}:', { buyer: r.buyer_full_name })} <StatusBadge status={r.status} />
            {r.response_notes && ` — ${r.response_notes}`}
          </p>
        ))}
      </div>

      <HistoryTable history={history} />
      <DisputesTable disputes={disputes} />
      {parcel.status !== 'deactivated' && <FlagDispute parcelId={parcel.parcel_id} onFlagged={done} />}
    </div>
  );
}

// Use case "Initiate Transfer Request"
function TransferRequestForm({ parcelId, onSent }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ buyer_full_name: '', buyer_national_id: '', buyer_contact: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post(`/parcels/${parcelId}/transfer-requests`, form);
      setOpen(false);
      onSent(t('Transfer request sent.'));
    } catch (err) {
      setError(errorMessage(err, t('Failed to submit transfer request')));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className="btn secondary" onClick={() => setOpen(true)}>{t('Request a Transfer')}</button>
    );
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>{t('New owner full name')}<input {...field('buyer_full_name')} required /></label>
        <label>{t('New owner national ID')}<input {...field('buyer_national_id')} required /></label>
        <label>{t('New owner phone number')}<input {...field('buyer_contact')} dir="ltr" /></label>
      </div>
      <label>{t('Note for land officer (optional)')}<textarea {...field('notes')} rows={2} /></label>
      {error && <div className="error-text">{error}</div>}
      <div className="actions">
        <button className="btn" type="submit" disabled={saving}>{t('Send Request')}</button>
        <button className="btn secondary" type="button" onClick={() => setOpen(false)}>{t('Cancel')}</button>
      </div>
    </form>
  );
}
