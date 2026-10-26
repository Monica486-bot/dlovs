import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth, homePath, STAFF_ROLES } from './context/AuthContext';
import { LanguageProvider } from './i18n';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';

import Login from './pages/Login';
import Register from './pages/public/Register';
import VerifyPhone from './pages/public/VerifyPhone';
import ForgotPassword from './pages/public/ForgotPassword';
import PublicVerify from './pages/public/PublicVerify';
import PublicParcel from './pages/public/PublicParcel';
import PublicOwner from './pages/public/PublicOwner';
import MyParcels from './pages/citizen/MyParcels';
import MyParcel from './pages/citizen/MyParcel';
import ReportPlot from './pages/citizen/ReportPlot';
import MyRequests from './pages/citizen/MyRequests';
import Notifications from './pages/Notifications';
import Account from './pages/Account';
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
import TransferApprovals from './pages/TransferApprovals';
import Disputes from './pages/Disputes';
import AuditLog from './pages/AuditLog';
import Admin from './pages/Admin';
import UsageReports from './pages/UsageReports';
import IdChecks from './pages/IdChecks';

function RequireRole({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user)} replace />;
  return <>{children}</>;
}

function ForAnyUser({ children }: { children: ReactNode }) {
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
  const staffPage = (page: ReactNode, roles: string[] = staff) => (
    <RequireRole roles={roles}><Layout>{page}</Layout></RequireRole>
  );
  const citizenPage = (page: ReactNode) => (
    <RequireRole roles={['citizen']}><PublicLayout>{page}</PublicLayout></RequireRole>
  );
  const publicPage = (page: ReactNode) => <PublicLayout>{page}</PublicLayout>;

  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/verify" element={publicPage(<PublicVerify />)} />
      <Route path="/verify/:id" element={publicPage(<PublicParcel />)} />
      <Route path="/verify/owners/:id" element={publicPage(<PublicOwner />)} />
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
      <Route path="/transfer-approvals" element={staffPage(<TransferApprovals />)} />
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
