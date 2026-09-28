import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <h1>DLOVS<br /><span style={{ fontWeight: 400, fontSize: '0.75rem' }}>{user?.full_name} · {user?.role?.replace('_', ' ')}</span></h1>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/parcels/new">Register Parcel</NavLink>
        <NavLink to="/parcels/search">Search / Verify</NavLink>
        <NavLink to="/disputes">Disputes</NavLink>
        <NavLink to="/audit-log">Audit Log</NavLink>
        <button className="logout-btn" onClick={handleLogout}>Log Out</button>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
