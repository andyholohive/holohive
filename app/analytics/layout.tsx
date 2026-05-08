import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Sidebar from '@/components/Sidebar';

/**
 * Standard ProtectedRoute + Sidebar wrapper. Mirrors the layout used by
 * every other top-level page (clients, crm/sales-pipeline, etc.) — the
 * analytics page was previously missing this file, which is why it
 * rendered without the sidebar.
 */
export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Sidebar>{children}</Sidebar>
    </ProtectedRoute>
  );
}
