import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Login from './pages/Login';
import SetupPassword from './pages/SetupPassword';
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import TenantBills from './pages/TenantBills';
import MyBills from './pages/MyBills';
import BillSplit from './pages/BillSplit';
import Management from './pages/Management';
import ManagementBatch from './pages/ManagementBatch';
import Payments from './pages/Payments';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { createBrowserApi } from './lib/browserApi';
import type { SessionUser } from './types';

if (!window.api) {
  window.api = createBrowserApi() as typeof window.api;
}

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const api = window.api;

  useEffect(() => {
    if (!api?.auth) {
      setLoading(false);
      return;
    }

    api.auth
      .getSession()
      .then((user) => {
        setSession(user);
      })
      .catch((error) => {
        console.error('Failed to load session', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [api]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-slate-300">Loading Billify...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login onSignedIn={setSession} />} />
      <Route path="/setup-password" element={<SetupPassword onChanged={setSession} />} />
      <Route
        path="/"
        element={
          <ProtectedRoute session={session}>
            <Layout session={session} onSessionChange={setSession}>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tenants"
        element={
          <ProtectedRoute session={session}>
            <Layout session={session} onSessionChange={setSession}>
              <Tenants />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tenants/:tenantId/bills"
        element={
          <ProtectedRoute session={session}>
            <Layout session={session} onSessionChange={setSession}>
              <TenantBills />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bills"
        element={
          <ProtectedRoute session={session}>
            <Layout session={session} onSessionChange={setSession}>
              <MyBills />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bills/:billId/split"
        element={
          <ProtectedRoute session={session}>
            <Layout session={session} onSessionChange={setSession}>
              <BillSplit />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/management"
        element={
          <ProtectedRoute session={session}>
            <Layout session={session} onSessionChange={setSession}>
              <Management />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/management/:batchId"
        element={
          <ProtectedRoute session={session}>
            <Layout session={session} onSessionChange={setSession}>
              <ManagementBatch />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute session={session}>
            <Layout session={session} onSessionChange={setSession}>
              <Payments />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute session={session} requireAdmin>
            <Layout session={session} onSessionChange={setSession}>
              <Users />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute session={session} requireAdmin>
            <Layout session={session} onSessionChange={setSession}>
              <Settings />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
