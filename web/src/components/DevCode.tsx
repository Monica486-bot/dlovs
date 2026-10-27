import { useT } from '../i18n';

interface DevCodeProps {
  code?: string | null;
}

// Shown only when the server returns the code because no SMS provider is
// configured (never in production).
export default function DevCode({ code }: DevCodeProps) {
  const { t } = useT();
  if (!code) return null;
  return (
    <div className="notice info dev-code">
      <span>{t('Demo code:')} <code dir="ltr">{code}</code></span>
    </div>
  );
}
