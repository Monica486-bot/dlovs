import { useT } from '../../i18n';
import ParcelSearch from '../../components/ParcelSearch';

// FR02: anyone can verify ownership on the web without an account.
export default function PublicVerify() {
  const { t } = useT();
  return (
    <div>
      <section className="hero">
        <h1>{t('Check who owns a plot before you pay')}</h1>
        <p>
          {t('Search the DLOVS register by parcel ID, owner name, neighbourhood, national ID, or GPS location. No account is needed.')}
        </p>
      </section>
      <ParcelSearch recordPath={(id) => `/verify/${id}`} />
      <div className="card tips">
        <h3>{t('Before you buy')}</h3>
        <ul>
          <li>{t('Make sure the name in DLOVS matches the person selling to you, and ask to see their national ID.')}</li>
          <li>{t('Do not pay for a plot marked disputed or deactivated, or one that is not registered at all.')}</li>
          <li>{t('Check the number of parcels registered to the seller. Someone selling many plots may be a broker.')}</li>
        </ul>
      </div>
    </div>
  );
}
