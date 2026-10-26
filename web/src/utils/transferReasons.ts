export function reasonLabel(t: (s: string) => string, reason: string | null | undefined, details: string | null | undefined): string {
  if (!reason) return '-';
  return details ? `${t(reason)}: ${details}` : t(reason);
}
