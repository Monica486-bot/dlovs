import { useState } from 'react';
import type { ChangeEvent, SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useT } from '../../i18n';
import FourNames from '../../components/FourNames';
import { EMPTY_NAMES, joinNames } from '../../utils/names';
import type { RegisteredUser } from '../../types';

// FR01: citizens register with a phone number and password (no email), then
// confirm the number with an SMS code.
export default function Register() {
  const { t } = useT();
  const navigate = useNavigate();
  const [form, setForm] = useState({ names: EMPTY_NAMES, phone_number: '', national_id: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const field = (name: Exclude<keyof typeof form, 'names'>) => ({
    value: form[name],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [name]: e.target.value }),
  });

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError(t('Passwords do not match'));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<RegisteredUser>('/auth/register', {
        full_name: joinNames(form.names),
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
        <h2>{t('Create Account')}</h2>
        <p className="page-subtitle">{t('Manage your land and flag disputes')}</p>
        <FourNames legend={t('Full name')} parts={form.names} onChange={(names) => setForm({ ...form, names })} />
        <label>
          {t('Phone Number')}
          <input {...field('phone_number')} autoComplete="tel" inputMode="tel" required dir="ltr" />
        </label>
        <label>
          {t('National ID (optional)')}
          <input {...field('national_id')} />
        </label>
        <div className="field-row">
          <label>{t('Password')}<input type="password" {...field('password')} minLength={6} autoComplete="new-password" required /></label>
          <label>{t('Confirm password')}<input type="password" {...field('confirm')} autoComplete="new-password" required /></label>
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn block" type="submit" disabled={saving}>{saving ? t('Creating account…') : t('Create Account')}</button>
        <div className="auth-links"><Link to="/login">{t('Already have an account? Log in')}</Link></div>
      </form>
    </div>
  );
}
