import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePermiso } from '@/hooks/usePermiso';
import { LoadingState } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ShieldAlert } from 'lucide-react';

export interface ProtectedRouteProps {
  /** Permiso único requerido. */
  permiso?: string;
  /** Basta con tener uno de estos permisos. */
  alguno?: string[];
  children: ReactNode;
}

/** Protege rutas: exige sesión activa y, opcionalmente, permisos. */
export function ProtectedRoute({ permiso, alguno, children }: ProtectedRouteProps) {
  const { user, tiene, tieneAlguno, status } = usePermiso();
  const location = useLocation();

  if (status === 'loading') return <LoadingState label="Verificando sesión…" />;

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const autorizado =
    (!permiso || tiene(permiso)) && (!alguno || alguno.length === 0 || tieneAlguno(...alguno));

  if (!autorizado) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Acceso denegado"
          description="No cuentas con los permisos necesarios para acceder a esta sección."
        />
      </div>
    );
  }

  return <>{children}</>;
}
