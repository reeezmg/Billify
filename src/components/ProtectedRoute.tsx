import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { SessionUser } from '../types';

type Props = {
  session: SessionUser | null;
  requireAdmin?: boolean;
  children: ReactNode;
};

export default function ProtectedRoute({ session, requireAdmin, children }: Props) {
  if (!session) return <Navigate to="/login" replace />;
  if (requireAdmin && session.role !== 'admin') return <Navigate to="/" replace />;
  if (session.must_change_password) return <Navigate to="/setup-password" replace />;
  return <>{children}</>;
}
