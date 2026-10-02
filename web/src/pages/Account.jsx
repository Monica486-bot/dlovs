import { useState } from 'react';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

// Profile details and changing your own password (e.g. after an
// administrator gave you a temporary one).
export default function Account() {
  const { t } = useT();
  const { user } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (form.next !== form.confirm) {
      setError(t('Passwords do not match'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/reset-password', { current_password: form.current, new_password: form.next });
      setSuccess(t('Password changed.'));
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setError(errorMessage(err, t('Password change failed')));
    } finally {
      setSaving(false);
    }
  }

  const roleName = { citizen: 'citizen', land_officer: 'land officer', administrator: 'administrator' }[user?.role];

  return (
    <div>
      <h2>{t('My Account')}</h2>
      <div className="card">
        <dl className="facts">
          <dt>{t('Name')}</dt><dd>{user?.full_name}</dd>
          <dt>{t('Phone Number')}</dt><dd dir="ltr">{user?.phone_number || '—'}</dd>
          <dt>{t('Role')}</dt><dd>{t(roleName)}</dd>
          {user?.role === 'citizen' && (
            <>
              <dt>{t('National ID')}</dt>
              <dd>
                {user?.national_id || t('Not set')}
                {user?.national_id && (
                  <span className="muted small">
                    {' · '}{user.national_id_verified ? t('confirmed by a land officer') : t('waiting for a land officer to see your ID card')}
                  </span>
                )}
              </dd>
            </>
          )}
        </dl>
      </div>
      <form className="card narrow" onSubmit={submit}>
        <h3>{t('Change password')}</h3>
        <label>{t('Current password')}<input type="password" {...field('current')} autoComplete="current-password" required /></label>
        <label>{t('New password (at least 6 characters)')}<input type="password" {...field('next')} minLength={6} autoComplete="new-password" required /></label>
        <label>{t('Confirm password')}<input type="password" {...field('confirm')} autoComplete="new-password" required /></label>
        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}
        <button className="btn" type="submit" disabled={saving}>{t('Change Password')}</button>
      </form>
    </div>
  );
}
