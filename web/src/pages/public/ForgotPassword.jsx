import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useT } from '../../i18n';
import DevCode from '../../components/DevCode';

// FR20: citizens reset a forgotten password with an SMS code. Land officers
// and administrators are told to ask an administrator.
export default function ForgotPassword() {
  const { t } = useT();
  const navigate = useNavigate();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function requestCode(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { phone_number: phone.trim() });
      if (data.staff) {
        setStep('staff');
      } else {
        setDevCode(data.dev_code);
        setMessage(t('We sent a code by SMS.'));
        setStep('code');
      }
    } catch (err) {
      setError(errorMessage(err, t('Could not send a reset code')));
    } finally {
      setSaving(false);
    }
  }

  async function reset(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/auth/reset-password-with-code', { phone_number: phone.trim(), code: code.trim(), new_password: password });
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      setError(errorMessage(err, t('Password reset failed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>{t('Reset your password')}</h2>
        {step === 'phone' && (
          <form onSubmit={requestCode}>
            <p className="page-subtitle">{t('We will text you a code.')}</p>
            <label>{t('Phone Number')}<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required dir="ltr" /></label>
            {error && <div className="error-text">{error}</div>}
            <button className="btn block" type="submit" disabled={saving}>{t('Send Code')}</button>
          </form>
        )}
        {step === 'staff' && (
          <div className="notice info">
            <span>{t('Staff passwords are reset by an administrator.')}</span>
          </div>
        )}
        {step === 'code' && (
          <form onSubmit={reset}>
            <p className="page-subtitle">{message}</p>
            <DevCode code={devCode} />
            <label>
              {t('Code')}
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required dir="ltr" className="code-input" />
            </label>
            <label>{t('New password')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete="new-password" required /></label>
            {error && <div className="error-text">{error}</div>}
            <button className="btn block" type="submit" disabled={saving || code.length !== 6}>{t('Reset Password')}</button>
          </form>
        )}
        <div className="auth-links"><Link to="/login">{t('Back to log in')}</Link></div>
      </div>
    </div>
  );
}
