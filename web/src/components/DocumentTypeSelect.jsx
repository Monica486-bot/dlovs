import { useEffect, useState } from 'react';
import api from '../api/client';
import { useT } from '../i18n';

let cached = null; // the list is fixed; fetch it once per visit

// The same document types as uploads (allocation letter, customary
// certificate…), so a parcel's paperwork is described the same way everywhere.
export default function DocumentTypeSelect({ label, value, onChange, disabled }) {
  const { t } = useT();
  const [types, setTypes] = useState(cached || []);

  useEffect(() => {
    if (cached) return;
    api.get('/documents/types').then(({ data }) => { cached = data; setTypes(data); }).catch(() => {});
  }, []);

  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{t('Not recorded')}</option>
        {types.map((type) => <option key={type} value={type}>{t(type)}</option>)}
      </select>
    </label>
  );
}
