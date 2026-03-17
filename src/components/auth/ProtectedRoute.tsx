// CREATED: 2026-03-17 16:00 IST (Jerusalem)
// ProtectedRoute - Route wrapper enforcing auth + subscription checks

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const isSubscriptionExpired = useAuthStore((s) => s.isSubscriptionExpired);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isSubscriptionExpired()) {
    return <Navigate to="/expired" replace />;
  }

  return <>{children}</>;
}
