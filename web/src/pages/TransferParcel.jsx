import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import { formatDate } from '../utils/format';

const EMPTY = { full_name: '', national_id: '', contact_number: '', document_type: '', notes: '' };

// FR11: LandOfficer.processTransfer(parcelId). With ?request=<id>, completes a
// citizen's transfer request, pre-filled with the buyer they named.
export default function TransferParcel() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const requestId = params.get('request');
  const navigate = useNavigate();
  const { t } = useT();
  const [parcel, setParcel] = useState(null);
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get(`/parcels/${id}/verify`),
      requestId ? api.get(`/transfer-requests/${requestId}`) : Promise.resolve(null),
    ])
      .then(([rec, req]) => {
        if (cancelled) return;
        setParcel(rec.data.parcel);
        const r = req?.data;
        if (r && r.status === 'pending' && r.parcel_id === Number(id)) {
          setRequest(r);
          setForm({
            full_name: r.buyer_full_name,
            national_id: r.buyer_national_id,
            contact_number: r.buyer_contact || '',
            document_type: '',
            notes: r.notes || '',
          });
        }
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, t('Failed to load parcel'))); });
    return () => { cancelled = true; };
  }, [id, requestId, t]);

  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const { notes, ...new_owner } = form;
      // expected_owner_id: refuse if someone else transferred the parcel after
      // this page was opened, instead of selling the same plot twice
      const { data } = await api.post(`/parcels/${id}/transfer`, {
        new_owner,
        notes,
        expected_owner_id: parcel.current_owner_id,
        transfer_request_id: request?.request_id,
      });
      navigate(`/parcels/${id}`, { state: { flash: t('Ownership transferred to {name}.', { name: data.new_owner_name }) } });
    } catch (err) {
      setError(errorMessage(err, t('Transfer failed')));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  const back = <p className="breadcrumb"><Link to={`/parcels/${id}`}>{t('← Parcel #{id}', { id })}</Link></p>;

  if (!parcel) {
    return <div><h2>{t('Transfer Ownership')}</h2>{error ? <div className="error-text">{error}</div> : <p className="muted">{t('Loading…')}</p>}</div>;
  }

  if (parcel.status !== 'active') {
    return (
      <div>
        {back}
        <h2>{t('Transfer Ownership')}</h2>
        <div className="notice warning">
          <span>{parcel.status === 'disputed' ? t('Resolve the open dispute first.') : t('Deactivated records cannot be transferred.')}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {back}
      <h2>{t('Transfer Ownership — Parcel #{id}', { id })}</h2>
      {request && (
        <p className="page-subtitle">{t('Request from {name} · {date}', { name: request.requested_by_name, date: formatDate(request.created_at) })}</p>
      )}

      <div className="card">
        <h3>{t('Current Owner')}</h3>
        <p className="owner-name">{parcel.owner_name}</p>
        <p className="muted" style={{ margin: 0 }}>
          {t('National ID')} {parcel.national_id || t('not recorded')} · {parcel.neighbourhood}
        </p>
      </div>

      <div className="card">
        <h3>{t('New Owner')}</h3>
        <form onSubmit={(e) => { e.preventDefault(); setError(''); setConfirming(true); }}>
          <div className="form-grid">
            <label>{t('Full name')}<input {...field('full_name')} required disabled={confirming} /></label>
            <label>{t('National ID')}<input {...field('national_id')} required disabled={confirming} /></label>
            <label>{t('Contact number')}<input {...field('contact_number')} disabled={confirming} dir="ltr" /></label>
            <label>{t('Supporting document')}<input {...field('document_type')} disabled={confirming} /></label>
          </div>
          <label>
            {t('Note')}
            <textarea {...field('notes')} rows={2} disabled={confirming} />
          </label>

          {error && <div className="error-text">{error}</div>}

          {!confirming ? (
            <button className="btn" type="submit">{t('Review Transfer')}</button>
          ) : (
            <div className="notice info">
              <span>
                {t('Transfer parcel #{id} from {from} to {to}?', { id, from: parcel.owner_name, to: form.full_name })}
              </span>
              <div className="actions">
                <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('Transferring…') : t('Approve Transfer')}</button>
                <button type="button" className="btn secondary" onClick={() => setConfirming(false)} disabled={saving}>{t('Change Details')}</button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
