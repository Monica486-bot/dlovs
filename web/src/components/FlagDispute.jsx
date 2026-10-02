import { useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useT } from '../i18n';

// FR12: any registered citizen can flag an ownership or boundary dispute.
export default function FlagDispute({ parcelId, onFlagged }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('ownership');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/disputes', { parcel_id: Number(parcelId), dispute_type: type, description: description.trim(), platform: 'web' });
      setOpen(false);
      setDescription('');
      onFlagged?.(t('Dispute submitted. A land officer will review it.'));
    } catch (err) {
      setError(errorMessage(err, t('Failed to flag dispute')));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return <button type="button" className="btn danger" onClick={() => setOpen(true)}>{t('Flag Dispute')}</button>;
  }

  return (
    <form onSubmit={submit} className="card flag-form">
      <h3>{t('Flag a Dispute')}</h3>
      <fieldset className="radio-cards">
        <legend>{t('Reason for dispute')}</legend>
        <label className={type === 'ownership' ? 'selected' : ''}>
          <input type="radio" name="dispute_type" value="ownership" checked={type === 'ownership'} onChange={() => setType('ownership')} />
          {t('Wrong Owner')}
        </label>
        <label className={type === 'boundary' ? 'selected' : ''}>
          <input type="radio" name="dispute_type" value="boundary" checked={type === 'boundary'} onChange={() => setType('boundary')} />
          {t('Boundary Conflict')}
        </label>
      </fieldset>
      <label>
        {t('Describe the issue')}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          minLength={10}
          required
        />
      </label>
      {error && <div className="error-text">{error}</div>}
      <div className="actions">
        <button className="btn" type="submit" disabled={saving}>{saving ? t('Sending…') : t('Submit Dispute')}</button>
        <button className="btn secondary" type="button" onClick={() => setOpen(false)}>{t('Cancel')}</button>
      </div>
    </form>
  );
}
