import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-4">
        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
        <span className="font-label-mono text-label-mono text-tertiary uppercase tracking-widest">
          Loading...
        </span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
