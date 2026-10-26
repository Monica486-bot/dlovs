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
      <div className="steps">
        <div className="step">
          <span className="step-number">1</span>
          <h3>{t('Scan or search')}</h3>
          <p>{t('Scan the QR code on the plot marker with your phone, or search here by parcel ID, owner name or neighbourhood.')}</p>
        </div>
        <div className="step">
          <span className="step-number">2</span>
          <h3>{t('Check the record')}</h3>
          <p>{t('Confirm the registered owner matches the seller, and look for dispute or fraud warnings.')}</p>
        </div>
        <div className="step">
          <span className="step-number">3</span>
          <h3>{t('Then decide')}</h3>
          <p>{t('Not registered, or disputed? Do not pay until a land officer has checked it.')}</p>
        </div>
      </div>
    </div>
  );
}
