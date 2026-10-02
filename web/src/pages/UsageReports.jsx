import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import { localDate } from '../utils/format';

// FR21: system usage reports for administrators, with CSV export.
// Report days are the user's own (local) days.
const today = () => localDate(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d); };
// exact start / end of those local days, sent to the server as timestamps
const startOfDay = (ymd) => new Date(`${ymd}T00:00:00`).toISOString();
const endOfDay = (ymd) => new Date(`${ymd}T23:59:59.999`).toISOString();

const TOTALS = [
  ['parcels_registered', 'Parcels registered'],
  ['transfers', 'Transfers'],
  ['parcel_edits', 'Parcel edits'],
  ['verifications', 'Ownership checks (record views)'],
  ['disputes_opened', 'Disputes opened'],
  ['disputes_resolved', 'Disputes resolved'],
  ['avg_days_to_resolve', 'Average days to resolve a dispute'],
  ['documents_uploaded', 'Documents uploaded'],
  ['documents_verified', 'Documents verified'],
  ['documents_rejected', 'Documents rejected'],
  ['unregistered_reports', 'Unregistered plot reports'],
  ['citizen_signups', 'New citizen accounts'],
];

function toCsv(rows, columns) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [columns.map(([, label]) => escape(label)).join(','), ...rows.map((r) => columns.map(([key]) => escape(r[key])).join(','))].join('\r\n');
}

function download(name, csv) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Table({ rows, columns }) {
  return (
    <div className="table-scroll">
      <table>
        <thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{columns.map(([key]) => <td key={key}>{r[key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function UsageReports() {
  const { t } = useT();
  const [range, setRange] = useState({ from: daysAgo(89), to: today() });
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/admin/reports', { params: { from: startOfDay(range.from), to: endOfDay(range.to) } })
      .then(({ data }) => { setReport(data); setError(''); })
      .catch((err) => setError(errorMessage(err, t('Failed to build report'))));
  }, [range, t]);

  useEffect(() => { load(); }, [load]);

  const officerColumns = [
    ['full_name', t('Name')], ['registered', t('Registered')], ['edited', t('Edited')], ['transfers', t('Transfers')],
    ['disputes_resolved', t('Disputes resolved')], ['documents_reviewed', t('Documents reviewed')], ['total_actions', t('Total actions')],
  ];
  const monthColumns = [
    ['month', t('Month')], ['parcels_registered', t('Registered')], ['transfers', t('Transfers')],
    ['disputes_resolved', t('Disputes resolved')], ['verifications', t('Ownership checks')],
  ];
  const areaColumns = [['neighbourhood', t('Neighbourhood')], ['parcels', t('Parcels')], ['disputed', t('Disputed')], ['deactivated', t('Deactivated')]];

  function exportAll() {
    const totals = TOTALS.map(([key, label]) => ({ metric: t(label), value: report.totals[key] ?? '' }));
    const parts = [
      `${t('DLOVS usage report')},${range.from},${range.to}`,
      '', toCsv(totals, [['metric', t('Metric')], ['value', t('Value')]]),
      '', toCsv(report.monthly, monthColumns),
      '', toCsv(report.officers, officerColumns),
      '', toCsv(report.neighbourhoods, areaColumns),
    ];
    download(`dlovs-report-${range.from}-to-${range.to}.csv`, parts.join('\r\n'));
  }

  return (
    <div>
      <div className="page-header">
        <h2>{t('Usage Reports')}</h2>
        {report && <button className="btn secondary" onClick={exportAll}>{t('Download CSV')}</button>}
      </div>
      <div className="card">
        <form className="filter-bar" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <label>{t('From')}<input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} required /></label>
          <label>{t('To')}<input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} required /></label>
          <div className="actions">
            {[30, 90, 365].map((n) => (
              <button key={n} type="button" className="btn secondary" onClick={() => setRange({ from: daysAgo(n - 1), to: today() })}>{t('Last {n} days', { n })}</button>
            ))}
          </div>
        </form>
      </div>
      {error && <div className="error-text">{error}</div>}
      {report && (
        <>
          <div className="stat-grid">
            {TOTALS.map(([key, label]) => (
              <div className="stat" key={key}>
                <span className="stat-value">{report.totals[key] ?? '—'}</span>
                <span className="stat-label">{t(label)}</span>
              </div>
            ))}
          </div>
          <div className="card"><h3>{t('By month')}</h3>{report.monthly.length ? <Table rows={report.monthly} columns={monthColumns} /> : <p className="muted">{t('No activity in this period.')}</p>}</div>
          <div className="card"><h3>{t('By officer')}</h3><Table rows={report.officers} columns={officerColumns} /></div>
          <div className="card"><h3>{t('By neighbourhood (all time)')}</h3><Table rows={report.neighbourhoods} columns={areaColumns} /></div>
        </>
      )}
    </div>
  );
}
