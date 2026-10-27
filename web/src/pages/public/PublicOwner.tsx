import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useT } from '../../i18n';
import { formatDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';
import type { IdParams, OwnerPortfolioData } from '../../types';

// FR09 for everyone: all parcels registered to an owner, so a buyer can check
// that what a seller claims matches the register, and notice a seller with
// many plots or many recent sales. National ID and phone are staff-only.
export default function PublicOwner() {
  const { id } = useParams<'id'>() as IdParams;
  const { t } = useT();
  const [data, setData] = useState<OwnerPortfolioData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get<OwnerPortfolioData>(`/owners/${id}`)
      .then(({ data: d }) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, t('Failed to load owner'))); });
    return () => { cancelled = true; };
  }, [id, t]);

  if (error) return <div className="error-text">{error}</div>;
  if (!data) return <p className="muted">{t('Loading…')}</p>;
  const { owner, parcels, previously_owned: previous } = data;

  return (
    <div>
      <p className="breadcrumb"><Link to="/verify">{t('← Verify a Parcel')}</Link></p>
      <h2>{t('Parcels registered to {name}', { name: owner.full_name })}</h2>
      <p className="muted">
        {t('Current parcels: {now} · Transferred away: {before}', { now: parcels.length, before: previous.length })}
      </p>

      <div className="card">
        <h3>{t('Current parcels')}</h3>
        {parcels.length === 0 ? <p className="muted">{t('No parcels currently registered to this owner.')}</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t('Parcel ID')}</th><th>{t('Location')}</th><th>{t('GPS')}</th><th>{t('Registered')}</th><th>{t('Status')}</th></tr></thead>
              <tbody>
                {parcels.map((p) => (
                  <tr key={p.parcel_id}>
                    <td><Link to={`/verify/${p.parcel_id}`}>#{p.parcel_id}</Link></td>
                    <td>{p.neighbourhood}</td>
                    <td dir="ltr">{Number(p.gps_lat).toFixed(5)}, {Number(p.gps_lng).toFixed(5)}</td>
                    <td>{formatDate(p.registered_date)}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previous.length > 0 && (
        <div className="card">
          <h3>{t('Previously owned')}</h3>
          <div className="table-scroll">
            <table>
              <thead><tr><th>{t('Parcel')}</th><th>{t('Transferred to')}</th><th>{t('Date')}</th></tr></thead>
              <tbody>
                {previous.map((p) => (
                  <tr key={p.parcel_id}>
                    <td><Link to={`/verify/${p.parcel_id}`}>#{p.parcel_id}</Link></td>
                    <td>{p.transferred_to}</td>
                    <td>{formatDate(p.transfer_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
