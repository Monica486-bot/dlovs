import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';
import { DocumentTable } from '../components/Documents';
import type { ParcelDocument } from '../types';

// FR10 review queue. FR14: documents the officer may not review (they
// registered the parcel or uploaded the document) say why instead of showing
// Verify / Reject.
const TABS = ['pending', 'verified', 'rejected'];

export default function Documents() {
  const { t, tn } = useT();
  const [tab, setTab] = useState('pending');
  const [documents, setDocuments] = useState<ParcelDocument[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api.get<ParcelDocument[]>('/documents', { params: { status: tab } })
      .then(({ data }) => { setDocuments(data); setError(''); })
      .catch((err) => setError(errorMessage(err, t('Failed to load documents'))));
  }, [tab, t]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h2>{t('Pending Document Review')}</h2>
      <p className="page-subtitle">
        {tab === 'pending' && documents ? tn('{n} document awaiting verification', '{n} documents awaiting verification', documents.length) : t('Land documents uploaded by owners')}
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
        {documents && <DocumentTable documents={documents} showParcel onChanged={(msg) => { setNotice(msg); load(); }} />}
      </div>
    </div>
  );
}
