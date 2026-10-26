const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
let locale = 'en-GB';

export function setFormatLanguage(lang: string): void {
  locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
}

export function formatDate(value: string | Date | null | undefined): string {
  return value ? new Date(value).toLocaleDateString(locale, DATE) : '-';
}

export function formatDateTime(value: string | Date | null | undefined): string {
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

export function localDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'], [3600, 'minute'], [86400, 'hour'], [86400 * 30, 'day'],
  ];
  let unit = 1;
  for (const [limit, name] of steps) {
    if (Math.abs(seconds) < limit) return rtf.format(Math.round(seconds / unit), name);
    unit = limit;
  }
  return formatDate(value);
}
