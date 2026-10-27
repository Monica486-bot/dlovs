import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import { formatDateTime } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import { reasonLabel } from '../utils/transferReasons';
import type { PendingTransferListItem } from '../types';

// FR11 / FR14: a second officer approves transfers with written consent.
export default function TransferApprovals() {
  const { t } = useT();
  const [items, setItems] = useState<PendingTransferListItem[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    api.get<PendingTransferListItem[]>('/pending-transfers')
      .then(({ data }) => setItems(data))
      .catch((err) => setError(errorMessage(err, t('Failed to load transfers'))));
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function act(promise: Promise<unknown>, message: string) {
    setError('');
    setNotice('');
    try {
      await promise;
      setNotice(message);
      setRejecting(null);
      setReason('');
      load();
    } catch (err) {
      setError(errorMessage(err, t('Something went wrong')));
    }
  }

  function approve(p: PendingTransferListItem) {
    if (!window.confirm(t('Approve the transfer of parcel #{id} from {from} to {to}? Ownership changes immediately.', { id: p.parcel_id, from: p.owner_name, to: p.new_owner_name }))) return;
    act(api.put(`/pending-transfers/${p.transfer_id}/approve`), t('✓ Ownership transferred to {name}.', { name: p.new_owner_name }));
  }

  return (
    <div>
      <h2>{t('Transfer Approvals')}</h2>
      <p className="page-subtitle">{t("Transfers waiting for a second officer to check the owner's written consent.")}</p>
      {notice && <div className="notice success">{notice}</div>}
      {error && <div className="error-text">{error}</div>}
      {items && items.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>{t('No transfers are waiting.')}</p></div>}

      {items?.map((p) => (
        <div className="card" key={p.transfer_id}>
          <div className="page-header">
            <h3 style={{ margin: 0 }}>
              <Link to={`/parcels/${p.parcel_id}`}>{t('Parcel #{id}', { id: p.parcel_id })}</Link> · {p.neighbourhood}
            </h3>
            <StatusBadge status="pending" />
          </div>
          <dl className="facts">
            <dt>{t('From')}</dt><dd>{p.owner_name}</dd>
            <dt>{t('To')}</dt><dd>{p.new_owner_name}{p.new_owner_national_id ? ` · ${p.new_owner_national_id}` : ''}</dd>
            <dt>{t('Reason for transfer')}</dt><dd>{reasonLabel(t, p.transfer_reason, p.transfer_reason_details)}</dd>
            <dt>{t("Owner's consent")}</dt>
            <dd>{p.consent_method === 'owner_code' ? t('Waiting for the owner to give the SMS code to {name}', { name: p.started_by_name }) : p.consent_document}</dd>
            <dt>{t('Started by')}</dt><dd>{p.started_by_name} · {formatDateTime(p.created_at)}</dd>
            {p.notes && (<><dt>{t('Note')}</dt><dd>{p.notes}</dd></>)}
          </dl>

          {rejecting === p.transfer_id ? (
            <form onSubmit={(e) => { e.preventDefault(); act(api.put(`/pending-transfers/${p.transfer_id}/reject`, { reason }), t('Transfer rejected.')); }}>
              <label>{t('Why is the consent not enough?')}<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required /></label>
              <div className="actions">
                <button className="btn danger" type="submit">{t('Reject Transfer')}</button>
                <button className="btn secondary" type="button" onClick={() => setRejecting(null)}>{t('Cancel')}</button>
              </div>
            </form>
          ) : (
            <div className="actions">
              {p.can_approve && <button className="btn" onClick={() => approve(p)}>{t('Approve Transfer')}</button>}
              {p.can_approve && <button className="btn secondary" onClick={() => { setRejecting(p.transfer_id); setReason(''); }}>{t('Reject')}</button>}
              {!p.can_approve && p.status === 'awaiting_approval' && <span className="muted">{t('You started this transfer, so another officer must approve it.')}</span>}
              {p.can_cancel && (
                <button className="btn secondary" onClick={() => window.confirm(t('Cancel this transfer? Ownership stays as it is.')) && act(api.put(`/pending-transfers/${p.transfer_id}/cancel`), t('Transfer cancelled.'))}>
                  {t('Cancel Transfer')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
