import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import LanguageToggle from './LanguageToggle';
import NotificationBell from './NotificationBell';

// Staff (land officer / administrator) layout: sidebar navigation.
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

  // parcel and owner pages are reached from Search, so keep it highlighted there
  const searchActive = ({ isActive }) =>
    isActive || /^\/(parcels\/\d|owners\/)/.test(location.pathname) ? 'active' : undefined;

  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label={t('Main navigation')}>
        <h1>
          DLOVS<br />
          <span className="sidebar-user">{user?.full_name} · {t(user?.role === 'administrator' ? 'administrator' : 'land officer')}</span>
        </h1>
        <div className="nav-links">
          <NavLink to="/dashboard">{t('Dashboard')}</NavLink>
          {isOfficer && <NavLink to="/parcels/new">{t('Register Parcel')}</NavLink>}
          <NavLink to="/parcels/search" className={searchActive}>{t('Search / Verify')}</NavLink>
          <span className="nav-heading">{t('Work queues')}</span>
          <NavLink to="/documents">{t('Documents')}</NavLink>
          <NavLink to="/disputes">{t('Disputes')}</NavLink>
          <NavLink to="/transfer-requests">{t('Transfer Requests')}</NavLink>
          <NavLink to="/reports">{t('Unregistered Plots')}</NavLink>
          <NavLink to="/id-checks">{t('ID Checks')}</NavLink>
          <span className="nav-heading">{t('Accountability')}</span>
          <NavLink to="/audit-log">{t('Audit Log')}</NavLink>
          {isAdmin && <NavLink to="/admin/reports">{t('Usage Reports')}</NavLink>}
          {isAdmin && <NavLink to="/admin" end>{t('Admin Panel')}</NavLink>}
        </div>
        <div className="sidebar-footer">
          <NotificationBell className="sidebar-bell" />
          <NavLink to="/account" className="sidebar-small">{t('My Account')}</NavLink>
          <LanguageToggle className="sidebar-small" />
          <button className="logout-btn" onClick={handleLogout}>{t('Log Out')}</button>
        </div>
      </nav>
      <main className="main-content">{children}</main>
    </div>
  );
}
