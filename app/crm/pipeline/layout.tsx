import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Sidebar from '@/components/Sidebar';

export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Sidebar>{children}</Sidebar>
    </ProtectedRoute>
  );
}
