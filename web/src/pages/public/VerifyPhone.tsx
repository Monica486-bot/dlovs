import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../../api/client';
import { useT } from '../../i18n';
import DevCode from '../../components/DevCode';

// FR01: confirm the phone number with the 6-digit SMS code.
export default function VerifyPhone() {
  const { t } = useT();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(location.state?.devCode);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/auth/verify-phone', { phone_number: phone.trim(), code: code.trim() });
      navigate('/login?verified=1', { replace: true });
    } catch (err) {
      setError(errorMessage(err, t('Verification failed')));
    } finally {
      setSaving(false);
    }
  }

  async function resend() {
    setError('');
    setInfo('');
    try {
      const { data } = await api.post('/auth/resend-code', { phone_number: phone.trim() });
      setDevCode(data.dev_code);
      setInfo(t('A new code has been sent.'));
    } catch (err) {
      setError(errorMessage(err, t('Could not send a code')));
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h2>{t('Verify Your Number')}</h2>
        <p className="page-subtitle">{t('We sent a 6-digit code to {phone}', { phone })}</p>
        <DevCode code={devCode} />
        <label>
          {t('Phone Number')}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required dir="ltr" />
        </label>
        <label>
          {t('Code')}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            required
            dir="ltr"
            className="code-input"
          />
        </label>
        {error && <div className="error-text">{error}</div>}
        {info && <div className="success-text">{info}</div>}
        <button className="btn block" type="submit" disabled={saving || code.length !== 6}>{saving ? t('Checking…') : t('Verify & Continue')}</button>
        <div className="auth-links">
          <button type="button" className="link-button" onClick={resend} disabled={!phone.trim()}>{t('Resend code')}</button>
          <Link to="/login">{t('Back to log in')}</Link>
        </div>
      </form>
    </div>
  );
}
