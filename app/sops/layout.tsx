import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Sidebar from '@/components/Sidebar';

export default function SOPsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRoles={['admin', 'super_admin']}>
      <Sidebar>{children}</Sidebar>
    </ProtectedRoute>
  );
}
