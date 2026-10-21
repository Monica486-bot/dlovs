import { useEffect, useState } from 'react';
import api from '../api/client';
import { useT } from '../i18n';

const OTHER = '__other__';
let cached = null; // the list rarely changes; fetch it once per visit

// Juba neighbourhoods as a dropdown, so the same area is always spelled the
// same way (a typed "Muniki" would never be found by a search for Munuki).
// "Other" allows an area that isn't on the list yet.
export default function NeighbourhoodSelect({ value, onChange }) {
  const { t } = useT();
  const [list, setList] = useState(cached?.neighbourhoods || []);
  const [city, setCity] = useState(cached?.city || 'Juba');
  const [other, setOther] = useState(false);

  useEffect(() => {
    if (cached) return;
    api.get('/parcels/neighbourhoods')
      .then(({ data }) => { cached = data; setList(data.neighbourhoods); setCity(data.city); })
      .catch(() => setOther(true)); // offline: fall back to typing it
  }, []);

  // a saved name that isn't on the list (e.g. an old typo) shows in the text box
  const onList = list.includes(value);
  const showText = other || (value && list.length > 0 && !onList);

  return (
    <>
      <label>
        {t('Neighbourhood ({city})', { city: t(city) })}
        <select
          value={showText ? OTHER : value}
          onChange={(e) => {
            if (e.target.value === OTHER) { setOther(true); onChange(''); } else { setOther(false); onChange(e.target.value); }
          }}
          required
        >
          <option value="" disabled>{t('Choose a neighbourhood')}</option>
          {list.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value={OTHER}>{t('Other (not on the list)')}</option>
        </select>
      </label>
      {showText && (
        <label>
          {t('Neighbourhood name')}
          <input value={value} onChange={(e) => onChange(e.target.value)} required />
          <span className="muted">{t('Check the spelling: it is how people will search for this parcel.')}</span>
        </label>
      )}
    </>
  );
}
