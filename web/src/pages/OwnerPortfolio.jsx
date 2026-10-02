import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import { formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

// FR09: every parcel registered to one owner (matched by national ID), with
// printable QR codes, plus parcels they have transferred away. A seller with
// many plots — or many recent sales — is worth a closer look.
export default function OwnerPortfolio() {
  const { id } = useParams();
  const { t } = useT();
  const [data, setData] = useState(null);
  const [qrs, setQrs] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/owners/${id}`)
      .then(({ data: d }) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, t('Failed to load owner'))); });
    return () => { cancelled = true; };
  }, [id, t]);

  async function loadQrs() {
    const entries = await Promise.all(
      data.parcels.map((p) => api.get(`/parcels/${p.parcel_id}/qr`).then(({ data: q }) => [p.parcel_id, q.qr_data_url]).catch(() => [p.parcel_id, null]))
    );
    setQrs(Object.fromEntries(entries));
  }

  if (error) return <div className="error-text">{error}</div>;
  if (!data) return <p className="muted">{t('Loading…')}</p>;
  const { owner, parcels, previously_owned: previous } = data;
  const showQr = Object.keys(qrs).length > 0;

  return (
    <div>
      <p className="breadcrumb no-print"><Link to="/parcels/search">{t('← Search')}</Link></p>
      <div className="page-header">
        <h2>{owner.full_name}</h2>
        <div className="actions no-print">
          {!showQr && parcels.length > 0 && <button className="btn secondary" onClick={loadQrs}>{t('Show QR Codes')}</button>}
          {showQr && <button className="btn" onClick={() => window.print()}>{t('Print QR Codes')}</button>}
        </div>
      </div>
      <div className="card no-print">
        <dl className="facts">
          <dt>{t('National ID')}</dt><dd>{owner.national_id || t('Not recorded')}</dd>
          <dt>{t('Contact')}</dt><dd dir="ltr">{owner.contact_number || '—'}</dd>
          <dt>{t('Parcels owned now')}</dt><dd>{parcels.length}</dd>
          <dt>{t('Parcels transferred away')}</dt><dd>{previous.length}</dd>
        </dl>
        {parcels.length >= 3 && (
          <p className="warning-text" style={{ marginBottom: 0 }}>
            {t('This owner holds {n} parcels. Check that each was registered with proper documents — brokers sometimes register several plots under one name.', { n: parcels.length })}
          </p>
        )}
      </div>

      <div className="card print-area">
        <h3 className="no-print">{t('Current parcels')}</h3>
        {parcels.length === 0 ? <p className="muted">{t('No parcels currently registered to this owner.')}</p> : (
          <div className={showQr ? 'qr-grid' : 'table-scroll'}>
            {showQr ? parcels.map((p) => (
              <div className="qr-tile" key={p.parcel_id}>
                {qrs[p.parcel_id] && <img src={qrs[p.parcel_id]} alt={t('QR code for parcel {id}', { id: p.parcel_id })} />}
                <div>{t('DLOVS Parcel #{id}', { id: p.parcel_id })} · {p.neighbourhood}</div>
              </div>
            )) : (
              <table>
                <thead><tr><th>{t('Parcel')}</th><th>{t('Neighbourhood')}</th><th>{t('GPS')}</th><th>{t('Area')}</th><th>{t('Registered')}</th><th>{t('Verified documents')}</th><th>{t('Status')}</th></tr></thead>
                <tbody>
                  {parcels.map((p) => (
                    <tr key={p.parcel_id}>
                      <td><Link to={`/parcels/${p.parcel_id}`}>#{p.parcel_id}</Link></td>
                      <td>{p.neighbourhood}</td>
                      <td dir="ltr">{Number(p.gps_lat).toFixed(5)}, {Number(p.gps_lng).toFixed(5)}</td>
                      <td>{p.area_sqm ? t('{n} m²', { n: Number(p.area_sqm) }) : '—'}</td>
                      <td>{formatDate(p.registered_date)}</td>
                      <td>{p.verified_documents}</td>
                      <td><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {previous.length > 0 && (
        <div className="card no-print">
          <h3>{t('Previously owned')}</h3>
          <table>
            <thead><tr><th>{t('Parcel')}</th><th>{t('Transferred to')}</th><th>{t('Date')}</th></tr></thead>
            <tbody>
              {previous.map((p) => (
                <tr key={p.parcel_id}>
                  <td><Link to={`/parcels/${p.parcel_id}`}>#{p.parcel_id}</Link></td>
                  <td>{p.transferred_to}</td>
                  <td>{formatDate(p.transfer_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
