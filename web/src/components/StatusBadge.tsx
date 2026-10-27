import { useT } from '../i18n';

// Status pill; the class keeps the colour, the text is translated.
interface StatusBadgeProps {
  status: string;
  label?: string;
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const { t } = useT();
  return <span className={`badge ${status}`}>{label ?? t(status.replace('_', ' '))}</span>;
}
