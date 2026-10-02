import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { formatDate, localDate } from '../utils/format';
import LocationButton from './LocationButton';
import StatusBadge from './StatusBadge';

// FR06 verification pathways and FR17 filters, shared by the public Verify
// page and the staff Search page. The search lives in the URL, so Back from a
// record returns to the same results and a search can be shared as a link.
const MODES = {
  any: 'All fields',
  parcel_id: 'Parcel ID',
  owner_name: 'Owner name',
  neighbourhood: 'Neighbourhood',
  national_id: 'National ID',
  near: 'Near a GPS point',
};
const RADII = [50, 100, 200, 500, 1000];

export default function ParcelSearch({ recordPath }) {
  const { t } = useT();
  const { user, isStaff } = useAuth();
  const [params, setParams] = useSearchParams();
  const urlBy = MODES[params.get('by')] ? params.get('by') : 'any';
  const urlQuery = params.get('q') || '';
  const urlLat = params.get('lat') || '';
  const urlLng = params.get('lng') || '';
  const urlRadius = params.get('radius') || '200';

  const [by, setBy] = useState(urlBy);
  const [query, setQuery] = useState(urlQuery);
  const [point, setPoint] = useState({ lat: urlLat, lng: urlLng, radius: urlRadius });
  const [filters, setFilters] = useState({ status: '', from: '', to: '', documents: '' });
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const hasSearch = urlBy === 'near' ? Boolean(urlLat && urlLng) : Boolean(urlQuery);
  useEffect(() => {
    if (!hasSearch) return;
    let cancelled = false;
    const request = urlBy === 'near'
      ? { by: 'near', lat: urlLat, lng: urlLng, radius: urlRadius }
      : { by: urlBy, query: urlQuery };
    api.get('/parcels/search', { params: request })
      .then(({ data }) => { if (!cancelled) { setResults(data); setError(''); } })
      .catch((err) => { if (!cancelled) { setResults(null); setError(errorMessage(err, t('Search failed'))); } });
    return () => { cancelled = true; };
  }, [urlBy, urlQuery, urlLat, urlLng, urlRadius, hasSearch, t]);

  function submit(e) {
    e.preventDefault();
    if (by === 'near') setParams({ by, lat: point.lat.trim(), lng: point.lng.trim(), radius: point.radius });
    else setParams({ by, q: query.trim() });
  }

  const shown = (results || []).filter((p) => {
    if (filters.status && p.status !== filters.status) return false;
    const registered = p.registered_date ? localDate(p.registered_date) : '';
    if (filters.from && registered < filters.from) return false;
    if (filters.to && registered > filters.to) return false;
    if (filters.documents === 'verified' && !(p.verified_documents > 0)) return false;
    if (filters.documents === 'pending' && !(p.pending_documents > 0)) return false;
    if (filters.documents === 'none' && p.verified_documents > 0) return false;
    return true;
  });
  const filtersOn = Object.values(filters).some(Boolean);
  const isNear = urlBy === 'near';
  const searchedFor = isNear ? t('within {r} m of {lat}, {lng}', { r: urlRadius, lat: urlLat, lng: urlLng }) : `"${urlQuery}"`;

  return (
    <>
      <div className="card">
        <form onSubmit={submit}>
          <div className="inline-form">
            <select value={by} onChange={(e) => setBy(e.target.value)} aria-label={t('Search by')}>
              {Object.entries(MODES).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
            </select>
            {by !== 'near' && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={by === 'any' ? t('Search by owner name or plot location') : ''}
                aria-label={t('Search terms')}
                required
              />
            )}
            {by === 'near' && (
              <select value={point.radius} onChange={(e) => setPoint({ ...point, radius: e.target.value })} aria-label={t('Distance')}>
                {RADII.map((r) => <option key={r} value={r}>{t('within {r} m', { r })}</option>)}
              </select>
            )}
            <button className="btn" type="submit">{t('Search')}</button>
          </div>
          {by === 'near' && (
            <div className="near-fields">
              <div className="field-row">
                <label>{t('GPS Latitude')}<input value={point.lat} onChange={(e) => setPoint({ ...point, lat: e.target.value })} inputMode="decimal" required dir="ltr" /></label>
                <label>{t('GPS Longitude')}<input value={point.lng} onChange={(e) => setPoint({ ...point, lng: e.target.value })} inputMode="decimal" required dir="ltr" /></label>
              </div>
              <LocationButton onLocate={({ lat, lng }) => setPoint({ ...point, lat: lat.toFixed(6), lng: lng.toFixed(6) })} />
            </div>
          )}
        </form>
      </div>

      {error && <div className="error-text">{error}</div>}

      {results && results.length === 0 && (
        <div className="notice warning">
          <strong>{t('Not registered')}</strong> {t('No parcel matches {what}.', { what: searchedFor })}{' '}
          {user && !isStaff && <Link to="/my/report">{t('Report this plot')}</Link>}
          {!user && <Link to="/login?next=/my/report">{t('Report this plot')}</Link>}
        </div>
      )}

      {results && results.length > 0 && (
        <div className="card">
          <div className="filter-bar">
            <label>
              {t('Status')}
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">{t('All statuses')}</option>
                {['active', 'disputed', 'deactivated'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
              </select>
            </label>
            <label>
              {t('Documents')}
              <select value={filters.documents} onChange={(e) => setFilters({ ...filters, documents: e.target.value })}>
                <option value="">{t('Any')}</option>
                <option value="verified">{t('Has verified documents')}</option>
                <option value="none">{t('No verified documents')}</option>
                <option value="pending">{t('Documents waiting for review')}</option>
              </select>
            </label>
            <label>
              {t('Registered from')}
              <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            </label>
            <label>
              {t('to')}
              <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            </label>
            {filtersOn && (
              <button type="button" className="btn secondary" onClick={() => setFilters({ status: '', from: '', to: '', documents: '' })}>
                {t('Clear filters')}
              </button>
            )}
            <span className="muted">{t('{shown} of {total} parcels', { shown: shown.length, total: results.length })}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Parcel ID')}</th><th>{t('Owner')}</th><th>{t('Location')}</th><th>{t('Registered')}</th>
                  {isNear && <th>{t('Distance')}</th>}<th>{t('Status')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.parcel_id}>
                    <td>#{p.parcel_id}</td>
                    <td>{p.owner_name}</td>
                    <td>{p.neighbourhood}</td>
                    <td>{formatDate(p.registered_date)}</td>
                    {isNear && <td>{t('{m} m', { m: p.distance_m })}</td>}
                    <td><StatusBadge status={p.status} /></td>
                    <td><Link className="view-link" to={recordPath(p.parcel_id)}>{t('View →')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
