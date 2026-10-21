// "Inheritance", or "Other — settlement agreed before the chief"
export function reasonLabel(t, reason, details) {
  if (!reason) return '—';
  return details ? `${t(reason)} — ${details}` : t(reason);
}
