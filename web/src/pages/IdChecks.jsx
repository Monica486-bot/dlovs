import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import { formatDate } from '../utils/format';

// A citizen's national ID links their account to land only after an officer
// has seen the ID card in person. Without this check, anyone could type a
// real owner's ID number and see — or try to sell — their land.
export default function IdChecks() {
  const { t } = useT();
  const [checks, setChecks] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api.get('/id-checks')
      .then(({ data }) => { setChecks(data); setError(''); })
      .catch((err) => setError(errorMessage(err, t('Failed to load ID checks'))));
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function decide(c, decision) {
    if (decision === 'verified' && !window.confirm(t('Have you seen {name}\'s national ID card in person, and does it show {id}?', { name: c.full_name, id: c.national_id }))) return;
    setError('');
    try {
      await api.put(`/id-checks/${c.user_id}`, { decision, reason: decision === 'rejected' ? reason.trim() : undefined });
      setNotice(decision === 'verified'
        ? t('ID confirmed for {name}.', { name: c.full_name })
        : t('ID rejected for {name}.', { name: c.full_name }));
      setRejecting(null);
      setReason('');
      load();
    } catch (err) {
      setError(errorMessage(err, t('Failed to update ID check')));
    }
  }

  return (
    <div>
      <h2>{t('ID Checks')}</h2>
      <p className="page-subtitle">{t('Confirm each citizen’s ID card in person')}</p>
      {error && <div className="error-text">{error}</div>}
      {notice && <div className="notice success">{notice}</div>}
      {checks?.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>{t('No ID checks waiting.')}</p></div>}

      {checks?.length > 0 && (
        <div className="card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Account name')}</th><th>{t('Phone')}</th><th>{t('National ID')}</th>
                  <th>{t('Registered owner')}</th><th>{t('Signed up')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.user_id}>
                    <td>{c.full_name}</td>
                    <td dir="ltr">{c.phone_number}</td>
                    <td><strong>{c.national_id}</strong></td>
                    <td>
                      {c.parcels_with_this_id > 0 ? (
                        <>
                          {c.registered_owner_names}
                          <div className="muted small">{t('{n} parcel(s)', { n: c.parcels_with_this_id })}</div>
                          {c.registered_owner_names && c.registered_owner_names.toLowerCase() !== c.full_name.toLowerCase() && (
                            <div className="warning-text">{t('Name differs')}</div>
                          )}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{formatDate(c.created_at)}</td>
                    <td className="cell-actions">
                      {rejecting !== c.user_id ? (
                        <>
                          <button className="btn" onClick={() => decide(c, 'verified')}>{t('Confirm ID')}</button>
                          <button className="btn danger" onClick={() => { setRejecting(c.user_id); setReason(''); }}>{t('Reject')}</button>
                        </>
                      ) : (
                        <form className="reject-form" onSubmit={(e) => { e.preventDefault(); decide(c, 'rejected'); }}>
                          <label>
                            {t('Reason')}
                            <input value={reason} onChange={(e) => setReason(e.target.value)} required />
                          </label>
                          <div className="actions">
                            <button className="btn danger" type="submit">{t('Reject ID')}</button>
                            <button className="btn secondary" type="button" onClick={() => setRejecting(null)}>{t('Cancel')}</button>
                          </div>
                        </form>
                      )}
                    </td>
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
