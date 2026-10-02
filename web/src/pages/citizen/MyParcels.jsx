import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import { formatDate } from '../../utils/format';
import StatusBadge from '../../components/StatusBadge';

// FR09 (citizen side): parcels registered to the citizen's national ID.
export default function MyParcels() {
  const { t } = useT();
  const { user, updateUser } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    api.get('/parcels/mine')
      .then(({ data: d }) => { setData(d); setError(''); })
      .catch((err) => setError(errorMessage(err, t('Failed to load your parcels'))));
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function saveNationalId(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put('/auth/profile', { national_id: nationalId.trim() });
      updateUser({ national_id: nationalId.trim(), national_id_verified: false });
      setConfirming(false);
      load();
    } catch (err) {
      setError(errorMessage(err, t('Update failed')));
    }
  }

  return (
    <div>
      <h2>{t('My Parcels')}</h2>
      <p className="page-subtitle">
        {data?.id_status === 'verified' ? t('{n} parcel(s) registered to your name', { n: data.parcels.length }) : t('Parcels registered to your national ID')}
      </p>
      {error && <div className="error-text">{error}</div>}

      {data?.id_status === 'missing' && (
        <div className="card">
          <h3>{t('Add your national ID')}</h3>
          <p className="muted">{t('Enter it exactly as it appears on your ID card.')}</p>
          <form onSubmit={(e) => { e.preventDefault(); setConfirming(true); }} className="inline-form">
            <input value={nationalId} onChange={(e) => setNationalId(e.target.value)} aria-label={t('National ID')} required disabled={confirming} />
            {!confirming && <button className="btn" type="submit">{t('Continue')}</button>}
          </form>
          {confirming && (
            <div className="notice info" style={{ marginTop: 12 }}>
              <span>{t('Save {id} as your national ID? This cannot be changed later.', { id: nationalId.trim() })}</span>
              <div className="actions">
                <button className="btn" onClick={saveNationalId}>{t('Save National ID')}</button>
                <button className="btn secondary" onClick={() => setConfirming(false)}>{t('Change')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {data?.id_status === 'pending' && (
        <div className="notice info">
          <span><strong>{t('ID check pending')}</strong> · {t('Show your ID card ({id}) at the land office to see your parcels here.', { id: user?.national_id })}</span>
        </div>
      )}

      {data?.id_status === 'verified' && data.parcels.length === 0 && (
        <div className="card">
          <p style={{ margin: 0 }}>{t('No parcels registered to your national ID yet.')} <Link to="/my/report">{t('Report a plot')}</Link></p>
        </div>
      )}

      <div className="parcel-cards">
        {data?.parcels.map((p) => (
          <Link key={p.parcel_id} to={`/my/parcels/${p.parcel_id}`} className="card parcel-card">
            <div className="parcel-card-top">
              <span className="parcel-card-id">{t('Parcel #{id}', { id: p.parcel_id })}</span>
              {p.transfer_pending ? <StatusBadge status="pending" label={t('Transfer Pending')} /> : <StatusBadge status={p.status} />}
            </div>
            <span className="parcel-card-title">{p.neighbourhood}</span>
            <span className="muted small">{t('Registered {date}', { date: formatDate(p.registered_date) })}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
