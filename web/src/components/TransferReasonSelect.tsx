import { useEffect, useState } from 'react';
import api from '../api/client';
import { useT } from '../i18n';

let cached = null; // the list is fixed; fetch it once per visit

// FR11: why the officer is transferring the parcel. "Other" asks for a short
// description. Both go into the ownership history.
export default function TransferReasonSelect({ reason, details, onChange, disabled }) {
  const { t } = useT();
  const [reasons, setReasons] = useState(cached || []);

  useEffect(() => {
    if (cached) return;
    api.get('/parcels/transfer-reasons').then(({ data }) => { cached = data; setReasons(data); }).catch(() => {});
  }, []);

  return (
    <>
      <label>
        {t('Reason for transfer')}
        <select value={reason} onChange={(e) => onChange(e.target.value, e.target.value === 'Other' ? details : '')} required disabled={disabled}>
          <option value="" disabled>{t('Choose a reason')}</option>
          {reasons.map((r) => <option key={r} value={r}>{t(r)}</option>)}
        </select>
      </label>
      {reason === 'Other' && (
        <label>
          {t('Describe the reason')}
          <input value={details} onChange={(e) => onChange(reason, e.target.value)} required minLength={3} disabled={disabled} />
        </label>
      )}
    </>
  );
}
