import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import { DocumentTable } from '../components/Documents';

// FR10 review queue. FR14: documents the officer may not review (they
// registered the parcel or uploaded the document) say why instead of showing
// Verify / Reject.
const TABS = ['pending', 'verified', 'rejected'];

export default function Documents() {
  const { t } = useT();
  const { user } = useAuth();
  const [tab, setTab] = useState('pending');
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api.get('/documents', { params: { status: tab } })
      .then(({ data }) => { setDocuments(data); setError(''); })
      .catch((err) => setError(errorMessage(err, t('Failed to load documents'))));
  }, [tab, t]);

  useEffect(() => { load(); }, [load]);

  const reviewable = documents?.filter((d) => d.can_review).length ?? 0;

  return (
    <div>
      <h2>{t('Documents')}</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        {t('Land documents uploaded by owners. Check each scan against the parcel record before verifying it. To prevent fraud, you cannot review documents on parcels you registered or documents you uploaded yourself.')}
      </p>
      <div className="tabs" role="tablist">
        {TABS.map((s) => (
          <button key={s} role="tab" aria-selected={tab === s} className={tab === s ? 'active' : ''} onClick={() => { setTab(s); setNotice(''); }}>
            {t(s)}
          </button>
        ))}
      </div>
      {error && <div className="error-text">{error}</div>}
      {notice && <div className="notice success">{notice}</div>}
      <div className="card">
        {tab === 'pending' && documents && user?.role === 'land_officer' && (
          <p className="muted" style={{ marginTop: 0 }}>{t('{n} of {total} waiting documents can be reviewed by you.', { n: reviewable, total: documents.length })}</p>
        )}
        {documents && <DocumentTable documents={documents} showParcel onChanged={(msg) => { setNotice(msg); load(); }} />}
      </div>
    </div>
  );
}
