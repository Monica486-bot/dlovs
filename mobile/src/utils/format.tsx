// Day-month-year with a written month ("2 Aug 2026"), so a date on a land
// record can't be misread as month/day. In Arabic, month names are Arabic but
// digits stay Western (as on most documents in Juba), same as the web app.
const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
let locale = 'en-GB';

export function setFormatLanguage(lang: string): void {
  locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
}

export function formatDate(value: string | number | Date | null | undefined): string {
  return value ? new Date(value).toLocaleDateString(locale, DATE) : '-';
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  return value
    ? new Date(value).toLocaleString(locale, { ...DATE, hour: '2-digit', minute: '2-digit' })
    : '-';
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
