import { useT } from '../../i18n';
import ParcelSearch from '../../components/ParcelSearch';

// FR02: anyone can verify ownership on the web without an account.
export default function PublicVerify() {
  const { t } = useT();
  return (
    <div>
      <section className="hero">
        <h1>{t('Verify a Parcel')}</h1>
        <p>{t('Check who owns a plot before you pay. No account needed.')}</p>
      </section>
      <ParcelSearch recordPath={(id) => `/verify/${id}`} />
    </div>
  );
}
