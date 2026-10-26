import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import { formatDate, formatDateTime } from '../utils/format';
import FourNames from '../components/FourNames';
import DocumentTypeSelect from '../components/DocumentTypeSelect';
import TransferReasonSelect from '../components/TransferReasonSelect';
import { reasonLabel } from '../utils/transferReasons';
import { EMPTY_NAMES, joinNames, splitNames } from '../utils/names';

const EMPTY = { names: EMPTY_NAMES, national_id: '', contact_number: '', document_type: '', notes: '', consent_document: '', reason: '', reason_details: '' };

// FR11: officer transfer. Ownership changes only with the owner's consent:
// their request, an SMS code, or a second officer's approval.
export default function TransferParcel() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const requestId = params.get('request');
  const navigate = useNavigate();
  const { t } = useT();
  const [parcel, setParcel] = useState(null);
  const [request, setRequest] = useState(null);
  const [consent, setConsent] = useState(null); // { method, owner_phones, pending }
  const [pending, setPending] = useState(null); // a transfer waiting for consent
  const [devCode, setDevCode] = useState('');
  const [code, setCode] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get(`/parcels/${id}/verify`),
      api.get(`/parcels/${id}/transfer-consent`),
      requestId ? api.get(`/transfer-requests/${requestId}`) : Promise.resolve(null),
    ])
      .then(([rec, cons, req]) => {
        if (cancelled) return;
        setParcel(rec.data.parcel);
        setConsent(cons.data);
        if (cons.data.pending) setPending(cons.data.pending);
        const r = req?.data;
        if (r && r.status === 'pending' && r.parcel_id === Number(id)) {
          setRequest(r);
          setForm({
            ...EMPTY,
            names: splitNames(r.buyer_full_name),
            national_id: r.buyer_national_id,
            contact_number: r.buyer_contact || '',
            notes: r.notes || '',
            reason: r.transfer_reason || '',
            reason_details: r.transfer_reason_details || '',
          });
        }
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, t('Failed to load parcel'))); });
    return () => { cancelled = true; };
  }, [id, requestId, t]);

  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  // FR11: the transfer issued a new QR code. Show it ready to print, since
  // the old marker now reads as replaced. replace: Back doesn't return to a
  // form for a transfer that's already done.
  function finished(data) {
    navigate(`/parcels/${id}`, {
      replace: true,
      state: { flash: t('✓ Ownership transferred to {name}.', { name: data.new_owner_name }), qrDataUrl: data.qr_data_url, newQr: true },
    });
  }

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const { notes, names, consent_document: consentDocument, reason, reason_details: reasonDetails, ...details } = form;
      // expected_owner_id: refuse if someone else transferred the parcel after
      // this page was opened, instead of selling the same plot twice
      const { data, status } = await api.post(`/parcels/${id}/transfer`, {
        new_owner: { ...details, full_name: joinNames(names) },
        notes,
        reason,
        reason_details: reasonDetails,
        expected_owner_id: parcel.current_owner_id,
        transfer_request_id: request?.request_id,
        consent_document: request ? undefined : consentDocument,
      });
      if (status === 200) {
        finished(data);
      } else if (data.status === 'awaiting_owner') {
        setPending({ transfer_id: data.transfer_id, status: 'awaiting_owner', new_owner_name: joinNames(names), can_confirm: true, can_cancel: true });
        setDevCode(data.dev_code || '');
        setInfo(t('A code was sent by SMS to the owner ({phones}). Ask the owner for it.', { phones: data.sent_to.join(', ') }));
        setConfirming(false);
      } else {
        // waiting for a second officer's approval
        navigate(`/parcels/${id}`, {
          replace: true,
          state: { flash: t('Sent for approval. Ownership changes once another officer approves it.'), flashTone: 'info' },
        });
      }
    } catch (err) {
      setError(errorMessage(err, t('Transfer failed')));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  async function confirmCode(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/pending-transfers/${pending.transfer_id}/confirm`, { code: code.trim() });
      finished(data);
    } catch (err) {
      setError(errorMessage(err, t('Transfer failed')));
    } finally {
      setSaving(false);
    }
  }

  async function resend() {
    setError('');
    try {
      const { data } = await api.post(`/pending-transfers/${pending.transfer_id}/resend`);
      setDevCode(data.dev_code || '');
      setCode('');
      setInfo(t('A new code was sent by SMS to the owner ({phones}).', { phones: data.sent_to.join(', ') }));
    } catch (err) {
      setError(errorMessage(err, t('Failed to send a new code')));
    }
  }

  async function cancel() {
    if (!window.confirm(t('Cancel this transfer? Ownership stays as it is.'))) return;
    setError('');
    try {
      await api.put(`/pending-transfers/${pending.transfer_id}/cancel`);
      setPending(null);
      setDevCode('');
      setInfo(t('Transfer cancelled.'));
    } catch (err) {
      setError(errorMessage(err, t('Cancel failed')));
    }
  }

  const back = <p className="breadcrumb"><Link to={`/parcels/${id}`}>{t('← Parcel #{id}', { id })}</Link></p>;

  if (!parcel || !consent) {
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

  const ownerCard = (
    <div className="card">
      <h3>{t('Current Owner')}</h3>
      <p className="owner-name">{parcel.owner_name}</p>
      <p className="muted" style={{ margin: 0 }}>
        {t('National ID')} {parcel.national_id || t('not recorded')} · {parcel.neighbourhood}
      </p>
    </div>
  );

  // A transfer already waiting for consent
  if (pending) {
    return (
      <div>
        {back}
        <h2>{t('Transfer Ownership: Parcel #{id}', { id })}</h2>
        {ownerCard}
        <div className="card">
          <h3>{t('Waiting for consent')}</h3>
          <p>
            {t('Transfer to {name}', { name: pending.new_owner_name })}
            {pending.transfer_reason ? ` · ${reasonLabel(t, pending.transfer_reason, pending.transfer_reason_details)}` : ''}
            {pending.created_at ? ` · ${formatDateTime(pending.created_at)}` : ''}
          </p>
          {info && <div className="notice info">{info}</div>}
          {devCode && (
            <div className="notice info">
              <strong>{t('Demo mode')}</strong> · {t('SMS is not configured. Code: {code}', { code: devCode })}
            </div>
          )}
          {pending.status === 'awaiting_owner' && pending.can_confirm && (
            <form onSubmit={confirmCode}>
              <label>
                {t("Owner's code")}
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  dir="ltr"
                />
              </label>
              <p className="muted">{t('Only the owner has this code. If they did not agree to the transfer, cancel it.')}</p>
              {error && <div className="error-text">{error}</div>}
              <div className="actions">
                <button className="btn" type="submit" disabled={saving || code.length !== 6}>{saving ? t('Transferring…') : t('Confirm Transfer')}</button>
                <button className="btn secondary" type="button" onClick={resend}>{t('Send a New Code')}</button>
              </div>
            </form>
          )}
          {pending.status === 'awaiting_owner' && !pending.can_confirm && (
            <p className="muted">{t("Started by {name}, who must enter the owner's code.", { name: pending.started_by_name })}</p>
          )}
          {pending.status === 'awaiting_approval' && (
            <div className="notice info">
              <span>{t('Waiting for another land officer to approve the consent document.')} <Link to="/transfer-approvals">{t('Transfer Approvals')}</Link></span>
            </div>
          )}
          {!(pending.status === 'awaiting_owner' && pending.can_confirm) && error && <div className="error-text">{error}</div>}
          {pending.can_cancel && (
            <div className="actions"><button className="btn danger" type="button" onClick={cancel}>{t('Cancel Transfer')}</button></div>
          )}
        </div>
      </div>
    );
  }

  const needsDocument = !request && consent.method === 'second_officer';
  const submitLabel = request ? t('Approve Transfer') : consent.method === 'owner_code' ? t('Send Code to Owner') : t('Send for Approval');

  return (
    <div>
      {back}
      <h2>{t('Transfer Ownership: Parcel #{id}', { id })}</h2>
      {request && (
        <p className="page-subtitle">{t('Request from {name} · {date}', { name: request.requested_by_name, date: formatDate(request.created_at) })}</p>
      )}
      {info && <div className="notice success">{info}</div>}

      {ownerCard}

      <div className="card">
        <h3>{t('New Owner')}</h3>
        <form onSubmit={(e) => { e.preventDefault(); setError(''); setConfirming(true); }}>
          <FourNames legend={t('Full name')} parts={form.names} onChange={(names) => setForm({ ...form, names })} disabled={confirming} />
          <div className="form-grid">
            <label>{t('National ID')}<input {...field('national_id')} required disabled={confirming} /></label>
            <label>{t('Contact number')}<input {...field('contact_number')} disabled={confirming} dir="ltr" /></label>
            <DocumentTypeSelect label={t('Supporting document')} value={form.document_type} onChange={(document_type) => setForm({ ...form, document_type })} disabled={confirming} />
          </div>
          <TransferReasonSelect
            reason={form.reason}
            details={form.reason_details}
            onChange={(reason, reasonDetails) => setForm({ ...form, reason, reason_details: reasonDetails })}
            disabled={confirming}
          />
          <label>
            {t('Note')}
            <textarea {...field('notes')} rows={2} disabled={confirming} />
          </label>

          <h3>{t("Owner's consent")}</h3>
          {request && (
            <p className="muted">{t('Requested by the owner. The new owner must be the buyer named in the request.')}</p>
          )}
          {!request && consent.method === 'owner_code' && (
            <p className="muted">{t('The owner will receive an SMS code at {phones}. Ownership changes once you enter it.', { phones: consent.owner_phones.join(', ') })}</p>
          )}
          {needsDocument && (
            <label>
              {t("The owner's written consent")}
              <textarea
                {...field('consent_document')}
                rows={3}
                required
                minLength={10}
                disabled={confirming}
                placeholder={t('e.g. Sale agreement signed before the Munuki chief, 12 Oct 2026, 3 witnesses')}
              />
              <span className="muted">{t('The owner has no DLOVS account. A second officer must approve this document.')}</span>
            </label>
          )}

          {error && <div className="error-text">{error}</div>}

          {!confirming ? (
            <button className="btn" type="submit">{t('Review Transfer')}</button>
          ) : (
            <div className="notice info">
              <span>
                {t('Transfer parcel #{id} from {from} to {to}?', { id, from: parcel.owner_name, to: joinNames(form.names) })}
                {' '}{t('Reason: {reason}', { reason: reasonLabel(t, form.reason, form.reason_details) })}
              </span>
              <div className="actions">
                <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('Sending…') : submitLabel}</button>
                <button type="button" className="btn secondary" onClick={() => setConfirming(false)} disabled={saving}>{t('Change Details')}</button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
