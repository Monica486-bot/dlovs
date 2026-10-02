import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import LanguageToggle from './LanguageToggle';
import NotificationBell from './NotificationBell';

// Public and citizen pages: a top bar instead of the staff sidebar.
export default function PublicLayout({ children }) {
  const { user, isStaff, logout } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/verify');
  }

  return (
    <div className="public-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          DLOVS
          <span className="brand-sub">{t('Digital Land Ownership Verification')}</span>
        </Link>
        <nav className="topnav" aria-label={t('Main navigation')}>
          <NavLink to="/verify">{t('Verify a Parcel')}</NavLink>
          {user && !isStaff && (
            <>
              <NavLink to="/my" end>{t('My Parcels')}</NavLink>
              <NavLink to="/my/requests">{t('My Requests')}</NavLink>
              <NavLink to="/my/report">{t('Report a Plot')}</NavLink>
              <NotificationBell />
              <NavLink to="/account">{t('My Account')}</NavLink>
            </>
          )}
          {user && isStaff && <NavLink to="/dashboard">{t('Staff Portal')}</NavLink>}
          {user ? (
            <button type="button" className="link-button" onClick={handleLogout}>{t('Log Out')}</button>
          ) : (
            <>
              <NavLink to="/login">{t('Log In')}</NavLink>
              <NavLink to="/register" className="topnav-cta">{t('Create Account')}</NavLink>
            </>
          )}
          <LanguageToggle />
        </nav>
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-footer">
        {t('DLOVS records are a verification aid for Juba. They do not replace the official land registry.')}
      </footer>
    </div>
  );
}
