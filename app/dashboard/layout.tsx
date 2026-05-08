import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Sidebar from '@/components/Sidebar';

/**
 * Standard ProtectedRoute + Sidebar wrapper for /dashboard and any
 * sub-routes (e.g. /dashboard/check-in). Mirrors the layout used by
 * every other top-level page in the app.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Sidebar>{children}</Sidebar>
    </ProtectedRoute>
  );
}
