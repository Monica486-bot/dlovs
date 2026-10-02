import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { formatDate } from '../utils/format';
import StatusBadge from './StatusBadge';

// Sections shared by the public, citizen, and staff parcel pages.

// default history notes written by the server (translated; officers' own notes aren't)
const SERVER_NOTES = ['Initial registration', 'Ownership transfer processed'];

export function RecordWarnings({ parcel, disputes }) {
  const { t } = useT();
  const open = disputes.filter((d) => d.status !== 'resolved');
  return (
    <>
      {parcel.status === 'deactivated' && (
        <div className="notice danger"><strong>{t('Deactivated — record found to be fraudulent')}</strong></div>
      )}
      {parcel.status !== 'deactivated' && open.length > 0 && (
        <div className="notice warning"><strong>{t('Disputed — not available for sale until resolved')}</strong></div>
      )}
      {parcel.status === 'active' && open.length === 0 && (
        <div className="notice success"><strong>{t('Verified — No active disputes')}</strong></div>
      )}
    </>
  );
}

export function OwnerFacts({ parcel, documents, ownerLink }) {
  const { t } = useT();
  const verified = documents.filter((d) => d.verification_status === 'verified').length;
  return (
    <div className="card">
      <h3>{t('Registered owner')}</h3>
      <p className="owner-name">{parcel.owner_name}</p>
      {ownerLink && <p className="owner-link"><Link to={ownerLink}>{t('All parcels owned by {name} →', { name: parcel.owner_name })}</Link></p>}
      <dl className="facts">
        {parcel.national_id !== undefined && (<><dt>{t('National ID')}</dt><dd>{parcel.national_id || '—'}</dd></>)}
        <dt>{t('Neighbourhood')}</dt><dd>{parcel.neighbourhood}</dd>
        <dt>{t('GPS')}</dt><dd dir="ltr">{Number(parcel.gps_lat).toFixed(6)}, {Number(parcel.gps_lng).toFixed(6)}</dd>
        <dt>{t('Area')}</dt><dd>{parcel.area_sqm ? t('{n} m²', { n: Number(parcel.area_sqm) }) : '—'}</dd>
        <dt>{t('Registered')}</dt><dd>{formatDate(parcel.registered_date)}</dd>
        <dt>{t('Documents')}</dt><dd>{t('{v} verified of {n}', { v: verified, n: documents.length })}</dd>
        <dt>{t('Status')}</dt><dd><StatusBadge status={parcel.status} /></dd>
      </dl>
    </div>
  );
}

export function HistoryTable({ history }) {
  const { t } = useT();
  return (
    <div className="card">
      <h3>{t('Ownership history')}</h3>
      <div className="table-scroll">
        <table>
          <thead><tr><th>{t('Date')}</th><th>{t('From')}</th><th>{t('To')}</th><th>{t('Notes')}</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.history_id}>
                <td>{formatDate(h.transfer_date)}</td>
                <td>{h.previous_owner_name || '—'}</td>
                <td>{h.new_owner_name}</td>
                <td>{SERVER_NOTES.includes(h.notes) ? t(h.notes) : h.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DisputesTable({ disputes }) {
  const { t } = useT();
  return (
    <div className="card">
      <h3>{t('Disputes')}</h3>
      {disputes.length === 0 ? (
        <p className="muted">{t('No disputes on record.')}</p>
      ) : (
        <div className="table-scroll"><table>
          <thead><tr><th>{t('Reported')}</th><th>{t('Type')}</th><th>{t('Status')}</th></tr></thead>
          <tbody>
            {disputes.map((d) => (
              <tr key={d.dispute_id}>
                <td>{formatDate(d.created_at)}</td>
                <td className="cap">{t(d.dispute_type)}</td>
                <td><StatusBadge status={d.status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
