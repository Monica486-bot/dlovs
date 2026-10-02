import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, homePath, STAFF_ROLES } from './context/AuthContext';
import { LanguageProvider } from './i18n';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';

// public
import Login from './pages/Login';
import Register from './pages/public/Register';
import VerifyPhone from './pages/public/VerifyPhone';
import ForgotPassword from './pages/public/ForgotPassword';
import PublicVerify from './pages/public/PublicVerify';
import PublicParcel from './pages/public/PublicParcel';
// citizen
import MyParcels from './pages/citizen/MyParcels';
import MyParcel from './pages/citizen/MyParcel';
import ReportPlot from './pages/citizen/ReportPlot';
import MyRequests from './pages/citizen/MyRequests';
// any logged-in user
import Notifications from './pages/Notifications';
import Account from './pages/Account';
// staff
import Dashboard from './pages/Dashboard';
import RegisterParcel from './pages/RegisterParcel';
import SearchVerify from './pages/SearchVerify';
import ParcelDetail from './pages/ParcelDetail';
import EditParcel from './pages/EditParcel';
import TransferParcel from './pages/TransferParcel';
import OwnerPortfolio from './pages/OwnerPortfolio';
import Documents from './pages/Documents';
import PlotReports from './pages/PlotReports';
import TransferRequests from './pages/TransferRequests';
import Disputes from './pages/Disputes';
import AuditLog from './pages/AuditLog';
import Admin from './pages/Admin';
import UsageReports from './pages/UsageReports';
import IdChecks from './pages/IdChecks';

// Only lets in the given roles; everyone else goes to their own home page.
function RequireRole({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user)} replace />;
  return children;
}

// Notifications and Account use the layout that matches who is logged in.
function ForAnyUser({ children }) {
  const { isStaff } = useAuth();
  return (
    <RequireRole>
      {isStaff ? <Layout>{children}</Layout> : <PublicLayout>{children}</PublicLayout>}
    </RequireRole>
  );
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={homePath(user)} replace />;
}

const staff = STAFF_ROLES;
const officer = ['land_officer'];
const admin = ['administrator'];

function AppRoutes() {
  const staffPage = (page, roles = staff) => <RequireRole roles={roles}><Layout>{page}</Layout></RequireRole>;
  const citizenPage = (page) => <RequireRole roles={['citizen']}><PublicLayout>{page}</PublicLayout></RequireRole>;
  const publicPage = (page) => <PublicLayout>{page}</PublicLayout>;

  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/verify" element={publicPage(<PublicVerify />)} />
      <Route path="/verify/:id" element={publicPage(<PublicParcel />)} />
      <Route path="/login" element={publicPage(<Login />)} />
      <Route path="/register" element={publicPage(<Register />)} />
      <Route path="/verify-phone" element={publicPage(<VerifyPhone />)} />
      <Route path="/forgot-password" element={publicPage(<ForgotPassword />)} />

      <Route path="/my" element={citizenPage(<MyParcels />)} />
      <Route path="/my/parcels/:id" element={citizenPage(<MyParcel />)} />
      <Route path="/my/report" element={citizenPage(<ReportPlot />)} />
      <Route path="/my/requests" element={citizenPage(<MyRequests />)} />

      <Route path="/notifications" element={<ForAnyUser><Notifications /></ForAnyUser>} />
      <Route path="/account" element={<ForAnyUser><Account /></ForAnyUser>} />

      <Route path="/dashboard" element={staffPage(<Dashboard />)} />
      <Route path="/parcels/new" element={staffPage(<RegisterParcel />, officer)} />
      <Route path="/parcels/search" element={staffPage(<SearchVerify />)} />
      <Route path="/parcels/:id" element={staffPage(<ParcelDetail />)} />
      <Route path="/parcels/:id/edit" element={staffPage(<EditParcel />, officer)} />
      <Route path="/parcels/:id/transfer" element={staffPage(<TransferParcel />, officer)} />
      <Route path="/owners/:id" element={staffPage(<OwnerPortfolio />)} />
      <Route path="/documents" element={staffPage(<Documents />)} />
      <Route path="/reports" element={staffPage(<PlotReports />)} />
      <Route path="/transfer-requests" element={staffPage(<TransferRequests />)} />
      <Route path="/disputes" element={staffPage(<Disputes />)} />
      <Route path="/id-checks" element={staffPage(<IdChecks />)} />
      <Route path="/audit-log" element={staffPage(<AuditLog />)} />
      <Route path="/admin" element={staffPage(<Admin />, admin)} />
      <Route path="/admin/reports" element={staffPage(<UsageReports />, admin)} />

      <Route path="*" element={<Home />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
