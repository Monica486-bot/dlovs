import { useT } from '../i18n';

// The four names on a South Sudanese ID card or passport.
const LABELS = ['First name', 'Middle name', 'Second middle name', 'Surname'];

interface FourNamesProps {
  legend: string;
  parts: string[];
  onChange: (parts: string[]) => void;
  disabled?: boolean;
}

export default function FourNames({ legend, parts, onChange, disabled }: FourNamesProps) {
  const { t } = useT();
  return (
    <fieldset className="four-names">
      <legend>{legend}</legend>
      <p className="muted">{t('As on the national ID or passport.')}</p>
      <div className="form-grid">
        {LABELS.map((label, i) => (
          <label key={label}>
            {t(label)}
            <input
              value={parts[i]}
              onChange={(e) => onChange(parts.map((p, j) => (j === i ? e.target.value : p)))}
              required
              disabled={disabled}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
