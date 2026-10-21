import { useT } from '../i18n';
import ParcelSearch from '../components/ParcelSearch';

export default function SearchVerify() {
  const { t } = useT();
  return (
    <div>
      <h2>{t('Parcel Records')}</h2>
      <p className="page-subtitle">{t('Search the register by parcel ID, owner, neighbourhood, national ID or location')}</p>
      <ParcelSearch recordPath={(id) => `/parcels/${id}`} />
    </div>
  );
}
