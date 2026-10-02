import { useT } from '../i18n';

// Status pill; the class keeps the colour, the text is translated.
export default function StatusBadge({ status, label }) {
  const { t } = useT();
  return <span className={`badge ${status}`}>{label ?? t(status.replace('_', ' '))}</span>;
}
