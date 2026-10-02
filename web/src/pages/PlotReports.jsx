import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { formatDate } from '../utils/format';
import StatusBadge from '../components/StatusBadge';

// FR13: citizens' reports of plots that aren't in DLOVS.
export default function PlotReports() {
  const { t } = useT();
  const { user } = useAuth();
  const [status, setStatus] = useState('open');
  const [reports, setReports] = useState(null);
  const [closing, setClosing] = useState(null);
  const [form, setForm] = useState({ status: 'registered', parcel_id: '', response_notes: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api.get('/unregistered-reports', { params: { status } })
      .then(({ data }) => { setReports(data); setError(''); })
      .catch((err) => setError(errorMessage(err, t('Failed to load reports'))));
  }, [status, t]);

  useEffect(() => { load(); }, [load]);

  async function close(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/unregistered-reports/${closing.report_id}`, {
        status: form.status,
        response_notes: form.response_notes.trim(),
        parcel_id: form.status === 'registered' && form.parcel_id ? Number(form.parcel_id) : undefined,
      });
      setNotice(t('Report closed. The citizen who reported it has been notified.'));
      setClosing(null);
      load();
    } catch (err) {
      setError(errorMessage(err, t('Failed to update report')));
    }
  }

  const canClose = user?.role === 'land_officer';

  return (
    <div>
      <h2>{t('Unregistered Plots')}</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        {t('Citizens report plots that have no DLOVS record — often a sign of an informal sale. Visit the plot, register it if the claim holds, then close the report.')}
      </p>
      <div className="tabs" role="tablist">
        {['open', 'registered', 'dismissed'].map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className={status === s ? 'active' : ''} onClick={() => { setStatus(s); setNotice(''); }}>{t(s)}</button>
        ))}
      </div>
      {error && <div className="error-text">{error}</div>}
      {notice && <div className="notice success">{notice}</div>}
      {reports?.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>{t('No reports here.')}</p></div>}

      {reports?.map((r) => (
        <div className="card" key={r.report_id}>
          <div className="page-header">
            <h3 style={{ margin: 0 }}>{r.neighbourhood} <StatusBadge status={r.status} /></h3>
            {canClose && r.status === 'open' && closing?.report_id !== r.report_id && (
              <div className="actions">
                <Link className="btn secondary" to="/parcels/new">{t('Register Parcel')}</Link>
                <button className="btn" onClick={() => { setClosing(r); setForm({ status: 'registered', parcel_id: '', response_notes: '' }); }}>{t('Close Report')}</button>
              </div>
            )}
          </div>
          <p className="dispute-description">{r.location_details}</p>
          <p className="muted" style={{ margin: 0 }}>
            {r.claimed_owner && <>{t('Claimed owner: {name}', { name: r.claimed_owner })} · </>}
            {r.gps_lat && <><span dir="ltr">{Number(r.gps_lat).toFixed(6)}, {Number(r.gps_lng).toFixed(6)}</span> · </>}
            {t('Reported {date} by {name}', { date: formatDate(r.created_at), name: r.reporter_name })}
            {r.reporter_phone && <> (<span dir="ltr">{r.reporter_phone}</span>)</>}
          </p>
          {r.status !== 'open' && (
            <p className="small" style={{ marginBottom: 0 }}>
              {t('{who} on {date}:', { who: r.handled_by_name, date: formatDate(r.handled_at) })} {r.response_notes}
              {r.parcel_id && <> · <Link to={`/parcels/${r.parcel_id}`}>{t('Parcel #{id}', { id: r.parcel_id })}</Link></>}
            </p>
          )}
          {closing?.report_id === r.report_id && (
            <form onSubmit={close} className="resolve-form">
              <fieldset className="radio-row">
                <label><input type="radio" checked={form.status === 'registered'} onChange={() => setForm({ ...form, status: 'registered' })} /> {t('Registered — the plot is now in DLOVS')}</label>
                <label><input type="radio" checked={form.status === 'dismissed'} onChange={() => setForm({ ...form, status: 'dismissed' })} /> {t('Dismissed — nothing to register')}</label>
              </fieldset>
              {form.status === 'registered' && (
                <label>{t('New parcel ID (optional)')}<input value={form.parcel_id} onChange={(e) => setForm({ ...form, parcel_id: e.target.value.replace(/\D/g, '') })} inputMode="numeric" /></label>
              )}
              <label>
                {t('Note for the citizen')}
                <textarea value={form.response_notes} onChange={(e) => setForm({ ...form, response_notes: e.target.value })} rows={2} required />
              </label>
              <div className="actions">
                <button className="btn" type="submit">{t('Close Report')}</button>
                <button className="btn secondary" type="button" onClick={() => setClosing(null)}>{t('Cancel')}</button>
              </div>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
