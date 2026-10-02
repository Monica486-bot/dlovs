import { useT } from '../i18n';
import ParcelSearch from '../components/ParcelSearch';

export default function SearchVerify() {
  const { t } = useT();
  return (
    <div>
      <h2>{t('Search / Verify Parcel')}</h2>
      <ParcelSearch recordPath={(id) => `/parcels/${id}`} />
    </div>
  );
}
