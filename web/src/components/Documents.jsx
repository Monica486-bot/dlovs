import { useEffect, useState } from 'react';
import api, { errorMessage, openDocument } from '../api/client';
import { useT } from '../i18n';
import { formatBytes, formatDate } from '../utils/format';
import StatusBadge from './StatusBadge';

// FR10 document list. Each document can be opened; officers allowed to review
// it (FR14 separation of duties is decided by the server and shown here as
// review_block) get Verify / Reject.
export function DocumentTable({ documents, onChanged, showParcel = false }) {
  const { t } = useT();
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  async function view(id) {
    setError('');
    try {
      await openDocument(id);
    } catch (err) {
      setError(errorMessage(err, t('Could not open the document')));
    }
  }

  async function review(doc, decision) {
    setError('');
    setBusy(doc.document_id);
    try {
      await api.put(`/documents/${doc.document_id}/review`, { decision, reason: decision === 'rejected' ? reason.trim() : undefined });
      setRejecting(null);
      setReason('');
      onChanged?.(decision === 'verified'
        ? t('{type} for parcel #{id} verified.', { type: t(doc.document_type), id: doc.parcel_id })
        : t('{type} for parcel #{id} rejected.', { type: t(doc.document_type), id: doc.parcel_id }));
    } catch (err) {
      setError(errorMessage(err, t('Review failed')));
    } finally {
      setBusy(null);
    }
  }

  if (documents.length === 0) return <p className="muted">{t('No documents uploaded yet.')}</p>;

  return (
    <>
      {error && <div className="error-text">{error}</div>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {showParcel && <th>{t('Parcel')}</th>}
              <th>{t('Document')}</th><th>{t('Uploaded')}</th><th>{t('Status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.document_id}>
                {showParcel && <td>#{d.parcel_id} · {d.neighbourhood}<br /><span className="muted">{d.owner_name}</span></td>}
                <td>
                  <strong>{t(d.document_type)}</strong><br />
                  <span className="muted">{d.original_name} · {formatBytes(d.size_bytes)}</span>
                </td>
                <td>
                  {formatDate(d.upload_date)}<br />
                  <span className="muted">{d.uploaded_by_name}{d.uploaded_by_role && d.uploaded_by_role !== 'citizen' ? ` (${t('officer')})` : ''}</span>
                </td>
                <td>
                  <StatusBadge status={d.verification_status} />
                  {d.verification_status !== 'pending' && d.verified_by_name && (
                    <div className="muted small">{t('by {name}', { name: d.verified_by_name })}</div>
                  )}
                  {d.rejection_reason && <div className="small">{d.rejection_reason}</div>}
                </td>
                <td className="cell-actions">
                  <button type="button" className="btn secondary" onClick={() => view(d.document_id)}>{t('View')}</button>
                  {d.verification_status === 'pending' && d.can_review && rejecting !== d.document_id && (
                    <>
                      <button type="button" className="btn" disabled={busy === d.document_id} onClick={() => review(d, 'verified')}>{t('Approve')}</button>
                      <button type="button" className="btn danger" onClick={() => { setRejecting(d.document_id); setReason(''); }}>{t('Reject')}</button>
                    </>
                  )}
                  {d.verification_status === 'pending' && !d.can_review && d.review_block && d.review_block !== 'Only land officers review documents' && (
                    <div className="muted small review-block">{t(d.review_block)}</div>
                  )}
                  {rejecting === d.document_id && (
                    <form className="reject-form" onSubmit={(e) => { e.preventDefault(); review(d, 'rejected'); }}>
                      <label>
                        {t('Reason')}
                        <input value={reason} onChange={(e) => setReason(e.target.value)} required />
                      </label>
                      <div className="actions">
                        <button className="btn danger" type="submit" disabled={busy === d.document_id}>{t('Reject Document')}</button>
                        <button className="btn secondary" type="button" onClick={() => setRejecting(null)}>{t('Cancel')}</button>
                      </div>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Upload form: PDF, JPG or PNG up to 5 MB (checked here and again on the server).
export function UploadDocument({ parcelId, onUploaded, onBehalf = false }) {
  const { t } = useT();
  const [types, setTypes] = useState([]);
  const [type, setType] = useState('');
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/documents/types').then(({ data }) => setTypes(data)).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (file.size > 5 * 1024 * 1024) {
      setError(t('The file is larger than 5 MB'));
      return;
    }
    const body = new FormData();
    body.append('file', file);
    body.append('document_type', type);
    setSaving(true);
    try {
      await api.post(`/parcels/${parcelId}/documents`, body);
      setFile(null);
      setType('');
      setInputKey((k) => k + 1);
      onUploaded?.(t('Document uploaded.'));
    } catch (err) {
      setError(errorMessage(err, t('Upload failed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="upload-form">
      <div className="field-row">
        <label>
          {t('Document type')}
          <select value={type} onChange={(e) => setType(e.target.value)} required>
            <option value="">{t('Choose…')}</option>
            {types.map((ty) => <option key={ty} value={ty}>{t(ty)}</option>)}
          </select>
        </label>
        <label>
          {t('File')} <span className="muted small" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>{t('PDF, JPG or PNG · up to 5 MB')}</span>
          <input key={inputKey} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files[0] || null)} required />
        </label>
      </div>
      {error && <div className="error-text">{error}</div>}
      <button className="btn" type="submit" disabled={saving || !file || !type}>{saving ? t('Uploading…') : t('Submit for Verification')}</button>
    </form>
  );
}
