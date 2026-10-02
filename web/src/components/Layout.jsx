import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import LanguageToggle from './LanguageToggle';
import NotificationBell from './NotificationBell';
import UserChip from './UserChip';

// Staff (land officer / administrator) layout: white header, navy sidebar.
export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const isOfficer = user?.role === 'land_officer';
  const isAdmin = user?.role === 'administrator';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // parcel and owner pages are reached from Parcel Records, so keep it highlighted there
  const recordsActive = ({ isActive }) =>
    isActive || /^\/(parcels\/\d|owners\/)/.test(location.pathname) ? 'active' : undefined;

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/dashboard" className="logo">DLOVS</Link>
        <div className="header-right">
          <LanguageToggle />
          <NotificationBell />
          <button type="button" className="link-button" onClick={handleLogout}>{t('Log Out')}</button>
          <UserChip />
        </div>
      </header>
      <div className="app-body">
        <nav className="sidebar" aria-label={t('Main navigation')}>
          <NavLink to="/dashboard">{t('Dashboard')}</NavLink>
          <NavLink to="/parcels/search" className={recordsActive}>{t('Parcel Records')}</NavLink>
          {isOfficer && <NavLink to="/parcels/new">{t('Register Parcel')}</NavLink>}
          <NavLink to="/transfer-requests">{t('Transfers')}</NavLink>
          <NavLink to="/disputes">{t('Disputes')}</NavLink>
          <NavLink to="/documents">{t('Documents')}</NavLink>
          <NavLink to="/id-checks">{t('ID Checks')}</NavLink>
          <NavLink to="/reports">{t('Unregistered Plots')}</NavLink>
          <NavLink to="/audit-log">{t('Audit Log')}</NavLink>
          {isAdmin && (
            <>
              <span className="sidebar-divider" />
              <NavLink to="/admin" end>{t('User Accounts')}</NavLink>
              <NavLink to="/admin/reports">{t('Reports')}</NavLink>
            </>
          )}
        </nav>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
