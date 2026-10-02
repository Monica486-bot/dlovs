// Day-month-year with a written month ("2 Aug 2026"), so a date on a land
// record can't be misread as month/day. In Arabic, month names are Arabic but
// digits stay Western (as on most documents in Juba).
const DATE = { day: 'numeric', month: 'short', year: 'numeric' };
let locale = 'en-GB';

export function setFormatLanguage(lang) {
  locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(locale, DATE) : '—';
}

export function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString(locale, { ...DATE, hour: '2-digit', minute: '2-digit' })
    : '—';
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// YYYY-MM-DD in the user's own time zone. (toISOString gives the UTC date,
// which in Juba is still the previous day until 2 a.m.)
export function localDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
