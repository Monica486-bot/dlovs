import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { homePath, useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { useT } from '../i18n';

// Only follow in-app paths after login
const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null);

export default function Login() {
  const { t } = useT();
  const [params] = useSearchParams();
  const [phone_number, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(phone_number.trim(), password);
      navigate(safeNext(params.get('next')) || homePath(user), { replace: true });
    } catch (err) {
      if (err.response?.data?.code === 'PHONE_NOT_VERIFIED') {
        navigate(`/verify-phone?phone=${encodeURIComponent(phone_number.trim())}`);
        return;
      }
      setError(errorMessage(err, t('Login failed')));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>{t('Log In')}</h2>
        <p className="page-subtitle">{t('Welcome back to DLOVS')}</p>
        {params.get('expired') && <div className="notice warning">{t('Your session has ended. Please log in again.')}</div>}
        {params.get('reset') && <div className="notice success">{t('Password reset. You can now log in.')}</div>}
        {params.get('verified') && <div className="notice success">{t('Phone number confirmed. You can now log in.')}</div>}
        <label>
          {t('Phone Number')}
          <input value={phone_number} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" required dir="ltr" />
        </label>
        <label>
          {t('Password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button className="btn block" type="submit" disabled={loading}>{loading ? t('Logging in…') : t('Log In')}</button>
        <div className="auth-links">
          <Link to="/forgot-password">{t('Forgot your password?')}</Link>
          <Link to="/register">{t('Create a citizen account')}</Link>
        </div>
      </form>
    </div>
  );
}
