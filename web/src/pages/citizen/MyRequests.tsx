import { useEffect, useState } from 'react';
import type { SubmitEvent } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useT } from '../../i18n';
import { formatDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import type { AcceptCodeSent, TransferRequestListItem, UnregisteredReport } from '../../types';

// A transfer the owner asked to make to this citizen: the buyer accepts with
// an SMS code (no officer needed) or declines.
interface IncomingTransferProps {
  request: TransferRequestListItem;
  onDone: () => void;
}

function IncomingTransfer({ request, onDone }: IncomingTransferProps) {
  const { t } = useT();
  const [sent, setSent] = useState<AcceptCodeSent | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try { await action(); } catch (err) { setError(errorMessage(err, t('Something went wrong'))); }
    setBusy(false);
  }
  const askCode = () => run(async () => setSent((await api.post<AcceptCodeSent>(`/transfer-requests/${request.request_id}/accept-code`)).data));
  const accept = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    run(async () => { await api.post(`/transfer-requests/${request.request_id}/accept`, { code: code.trim() }); onDone(); });
  };
  const decline = () => {
    if (!window.confirm(t('Decline this transfer?'))) return;
    run(async () => { await api.put(`/transfer-requests/${request.request_id}/decline`); onDone(); });
  };

  return (
    <div className="card">
      <h3>{t('{owner} wants to transfer parcel #{id} to you', { owner: request.requested_by_name, id: request.parcel_id })}</h3>
      <p>
        {request.neighbourhood} · {request.transfer_reason && t(request.transfer_reason)}{request.transfer_reason_details ? ` (${request.transfer_reason_details})` : ''}
        {' · '}<Link to={`/verify/${request.parcel_id}`}>{t('Check the parcel record')}</Link>
      </p>
      <p className="muted">{t('Only accept after you have checked the plot and agreed the terms with the owner. Accepting registers the parcel to you straight away.')}</p>
      {error && <div className="error-text">{error}</div>}
      {!sent && (
        <div className="actions">
          <button className="btn" onClick={askCode} disabled={busy}>{t('Accept: send me a code')}</button>
          <button className="btn secondary" onClick={decline} disabled={busy}>{t('Decline')}</button>
        </div>
      )}
      {sent && (
        <form onSubmit={accept}>
          <p>{t('A code was sent to {phone}.', { phone: sent.sent_to })}{sent.dev_code && <> {t('Demo code:')} <strong>{sent.dev_code}</strong></>}</p>
          <label>{t('Code')}<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} required /></label>
          <div className="actions">
            <button className="btn" type="submit" disabled={busy || code.trim().length !== 6}>{t('Accept the transfer')}</button>
            <button type="button" className="btn secondary" onClick={askCode} disabled={busy}>{t('Send a new code')}</button>
          </div>
        </form>
      )}
    </div>
  );
}

// What happened to the citizen's transfer requests and unregistered-plot reports.
export default function MyRequests() {
  const { t } = useT();
  const [transfers, setTransfers] = useState<TransferRequestListItem[] | null>(null);
  const [reports, setReports] = useState<UnregisteredReport[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    Promise.all([
      api.get<TransferRequestListItem[]>('/transfer-requests', { params: { status: 'all' } }),
      api.get<UnregisteredReport[]>('/unregistered-reports'),
    ])
      .then(([tr, rp]) => { setTransfers(tr.data); setReports(rp.data); })
      .catch((err) => setError(errorMessage(err, t('Failed to load your requests'))));
  }, [t, reload]);

  const incoming = (transfers || []).filter((r) => r.incoming && r.status === 'pending');
  const mine = transfers?.filter((r) => !r.incoming);

  return (
    <div>
      <h2>{t('My Requests')}</h2>
      <p className="page-subtitle">{t('Your transfer requests and plot reports')}</p>
      {error && <div className="error-text">{error}</div>}

      {incoming.map((r) => <IncomingTransfer key={r.request_id} request={r} onDone={() => setReload((n) => n + 1)} />)}

      <div className="card">
        <h3>{t('Transfer requests')}</h3>
        {mine?.length === 0 && <p className="muted">{t('You have not requested any transfers.')}</p>}
        {mine && mine.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t('Date')}</th><th>{t('Parcel')}</th><th>{t('New Owner')}</th><th>{t('Status')}</th><th>{t('Response')}</th></tr></thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.request_id}>
                    <td>{formatDate(r.created_at)}</td>
                    <td><Link to={`/my/parcels/${r.parcel_id}`}>#{r.parcel_id}</Link></td>
                    <td>{r.buyer_full_name}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      {r.response_notes || (r.status === 'pending'
                        ? (r.buyer_can_accept ? t('Waiting for the buyer to accept in DLOVS') : t('Waiting for a land officer'))
                        : '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>{t('Plot reports')}</h3>
        {reports?.length === 0 && <p className="muted">{t('You have not reported any plots.')} <Link to="/my/report">{t('Report a plot')}</Link></p>}
        {reports && reports.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t('Date')}</th><th>{t('Neighbourhood')}</th><th>{t('Status')}</th><th>{t('Response')}</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.report_id}>
                    <td>{formatDate(r.created_at)}</td>
                    <td>{r.neighbourhood}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      {r.response_notes || '-'}
                      {r.parcel_id && <> · <Link to={`/verify/${r.parcel_id}`}>{t('Parcel #{id}', { id: r.parcel_id })}</Link></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
