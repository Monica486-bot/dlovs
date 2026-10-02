import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import LanguageToggle from './LanguageToggle';
import NotificationBell from './NotificationBell';
import UserChip from './UserChip';

// Public and citizen pages: the same white header, no sidebar.
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
      <header className="app-header">
        <Link to="/" className="logo">DLOVS</Link>
        <nav className="header-right" aria-label={t('Main navigation')}>
          <NavLink to="/verify">{t('Verify a Parcel')}</NavLink>
          {user && !isStaff && (
            <>
              <NavLink to="/my" end>{t('My Parcels')}</NavLink>
              <NavLink to="/my/requests">{t('My Requests')}</NavLink>
              <NavLink to="/my/report">{t('Report a Plot')}</NavLink>
            </>
          )}
          {user && isStaff && <NavLink to="/dashboard">{t('Staff Portal')}</NavLink>}
          <LanguageToggle />
          {user ? (
            <>
              {!isStaff && <NotificationBell />}
              <button type="button" className="link-button" onClick={handleLogout}>{t('Log Out')}</button>
              <UserChip />
            </>
          ) : (
            <>
              <NavLink to="/login">{t('Log In')}</NavLink>
              <NavLink to="/register" className="header-cta">{t('Create Account')}</NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="public-main">{children}</main>
      <footer className="public-footer">{t('DLOVS · Digital Land Ownership Verification System · Juba')}</footer>
    </div>
  );
}
