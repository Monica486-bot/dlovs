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
      onFlagged?.(t('Dispute flagged. Everyone who checks parcel #{id} will now see a warning, and a land officer will review it.', { id: parcelId }));
    } catch (err) {
      setError(errorMessage(err, t('Failed to flag dispute')));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return <button type="button" className="btn secondary" onClick={() => setOpen(true)}>{t('Flag a Dispute')}</button>;
  }

  return (
    <form onSubmit={submit} className="card flag-form">
      <h3>{t('Flag a dispute on parcel #{id}', { id: parcelId })}</h3>
      <fieldset className="radio-cards">
        <legend>{t('What kind of problem?')}</legend>
        <label className={type === 'ownership' ? 'selected' : ''}>
          <input type="radio" name="dispute_type" value="ownership" checked={type === 'ownership'} onChange={() => setType('ownership')} />
          <strong>{t('Ownership')}</strong>
          <span>{t("Someone else claims to own this plot, or it was sold without the owner's consent.")}</span>
        </label>
        <label className={type === 'boundary' ? 'selected' : ''}>
          <input type="radio" name="dispute_type" value="boundary" checked={type === 'boundary'} onChange={() => setType('boundary')} />
          <strong>{t('Boundary')}</strong>
          <span>{t("The plot's edges or size are wrong, or overlap with a neighbour.")}</span>
        </label>
      </fieldset>
      <label>
        {t('What is happening?')}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          minLength={10}
          required
          placeholder={t('Describe the problem, who is involved, and when it started')}
        />
      </label>
      {error && <div className="error-text">{error}</div>}
      <div className="actions">
        <button className="btn" type="submit" disabled={saving}>{saving ? t('Sending…') : t('Flag Dispute')}</button>
        <button className="btn secondary" type="button" onClick={() => setOpen(false)}>{t('Cancel')}</button>
      </div>
    </form>
  );
}
