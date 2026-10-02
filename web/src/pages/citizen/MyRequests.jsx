import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useT } from '../../i18n';
import { formatDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';

// What happened to the citizen's transfer requests and unregistered-plot reports.
export default function MyRequests() {
  const { t } = useT();
  const [transfers, setTransfers] = useState(null);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/transfer-requests', { params: { status: 'all' } }), api.get('/unregistered-reports')])
      .then(([tr, rp]) => { setTransfers(tr.data); setReports(rp.data); })
      .catch((err) => setError(errorMessage(err, t('Failed to load your requests'))));
  }, [t]);

  return (
    <div>
      <h2>{t('My Requests')}</h2>
      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <h3>{t('Transfer requests')}</h3>
        {transfers?.length === 0 && <p className="muted">{t('You have not requested any transfers.')}</p>}
        {transfers?.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t('Date')}</th><th>{t('Parcel')}</th><th>{t('Buyer')}</th><th>{t('Status')}</th><th>{t("Officer's response")}</th></tr></thead>
              <tbody>
                {transfers.map((r) => (
                  <tr key={r.request_id}>
                    <td>{formatDate(r.created_at)}</td>
                    <td><Link to={`/my/parcels/${r.parcel_id}`}>#{r.parcel_id}</Link></td>
                    <td>{r.buyer_full_name}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.response_notes || (r.status === 'pending' ? t('Waiting for a land officer') : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>{t('Reports of unregistered plots')}</h3>
        {reports?.length === 0 && <p className="muted">{t('You have not reported any plots.')} <Link to="/my/report">{t('Report a plot')}</Link></p>}
        {reports?.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t('Date')}</th><th>{t('Neighbourhood')}</th><th>{t('Status')}</th><th>{t("Officer's response")}</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.report_id}>
                    <td>{formatDate(r.created_at)}</td>
                    <td>{r.neighbourhood}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      {r.response_notes || (r.status === 'open' ? t('Waiting for a land officer') : '—')}
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
