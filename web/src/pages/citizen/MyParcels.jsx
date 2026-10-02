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
      <p className="muted">{t('Hello {name}. These are the parcels registered in DLOVS to your national ID.', { name: user?.full_name })}</p>
      {error && <div className="error-text">{error}</div>}

      {data?.id_status === 'missing' && (
        <div className="card">
          <h3>{t('Add your national ID')}</h3>
          <p>{t('Your parcels are found using your national ID. Enter it exactly as it appears on your ID card, then show the card at the land office once so an officer can confirm it is yours. You can only set it once; after that, only an administrator can change it.')}</p>
          <form onSubmit={(e) => { e.preventDefault(); setConfirming(true); }} className="inline-form">
            <input value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="SS-1234567" aria-label={t('National ID')} required disabled={confirming} />
            {!confirming && <button className="btn" type="submit">{t('Continue')}</button>}
          </form>
          {confirming && (
            <div className="notice warning" style={{ marginTop: 12 }}>
              <p style={{ marginTop: 0 }}>{t('Save {id} as your national ID? This cannot be changed later.', { id: nationalId.trim() })}</p>
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
          <strong>{t('One more step: show your ID card at the land office.')}</strong>{' '}
          {t("You entered national ID {id}. To protect owners from people using someone else's ID number, a land officer must see your ID card once before your parcels appear here. Until then you can still check parcels, flag disputes and report plots.", { id: user?.national_id })}
        </div>
      )}

      {data?.id_status === 'verified' && data.parcels.length === 0 && (
        <div className="card">
          <p style={{ marginTop: 0 }}>{t('No parcels are registered to your national ID yet.')}</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            {t('A land officer registers land at the land office. If you own a plot that is not in DLOVS,')}{' '}
            <Link to="/my/report">{t('report it here')}</Link>.
          </p>
        </div>
      )}

      <div className="parcel-cards">
        {data?.parcels.map((p) => (
          <Link key={p.parcel_id} to={`/my/parcels/${p.parcel_id}`} className="card parcel-card">
            <div className="parcel-card-top">
              <strong>{t('Parcel #{id}', { id: p.parcel_id })} · {p.neighbourhood}</strong>
              <StatusBadge status={p.status} />
            </div>
            <span className="muted">{t('Registered {date}', { date: formatDate(p.registered_date) })}</span>
            <span>{t('{v} verified documents', { v: p.verified_documents })}{p.pending_documents > 0 && ` · ${t('{n} waiting for review', { n: p.pending_documents })}`}</span>
            {p.open_disputes > 0 && <span className="warning-text">{t('{n} open dispute(s)', { n: p.open_disputes })}</span>}
            {p.transfer_pending && <span className="muted">{t('Transfer request pending')}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
