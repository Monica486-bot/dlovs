import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useT } from '../../i18n';

// FR01: citizens register with a phone number and password (no email), then
// confirm the number with an SMS code.
export default function Register() {
  const { t } = useT();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', phone_number: '', national_id: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError(t('Passwords do not match'));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/auth/register', {
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim(),
        national_id: form.national_id.trim() || undefined,
        password: form.password,
        platform: 'web',
      });
      navigate(`/verify-phone?phone=${encodeURIComponent(data.phone_number)}`, { state: { devCode: data.dev_code } });
    } catch (err) {
      setError(errorMessage(err, t('Registration failed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card wide" onSubmit={submit}>
        <h2>{t('Create a citizen account')}</h2>
        <p className="muted">
          {t('You only need an account to flag disputes, upload your land documents, request transfers, or see the parcels registered to you. Checking a parcel never needs one.')}
        </p>
        <label>{t('Full name')}<input {...field('full_name')} autoComplete="name" required /></label>
        <label>
          {t('Phone Number')}
          <input {...field('phone_number')} placeholder="+211912345678" autoComplete="tel" inputMode="tel" required dir="ltr" />
          <span className="hint">{t('With the country code. We will send a code to this number by SMS.')}</span>
        </label>
        <label>
          {t('National ID (optional)')}
          <input {...field('national_id')} />
          <span className="hint">{t('Links your account to parcels registered under this ID. It is never shown to other users, and can only be set once.')}</span>
        </label>
        <div className="field-row">
          <label>{t('Password (at least 6 characters)')}<input type="password" {...field('password')} minLength={6} autoComplete="new-password" required /></label>
          <label>{t('Confirm password')}<input type="password" {...field('confirm')} autoComplete="new-password" required /></label>
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn block" type="submit" disabled={saving}>{saving ? t('Creating account…') : t('Create Account')}</button>
        <div className="auth-links"><Link to="/login">{t('Already have an account? Log in')}</Link></div>
      </form>
    </div>
  );
}
