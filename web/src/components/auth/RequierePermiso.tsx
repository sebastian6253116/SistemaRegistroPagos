import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { usePermiso } from '@/hooks/usePermiso';
import { EmptyState } from '@/components/ui/empty-state';

export interface RequierePermisoProps {
  permiso?: string;
  alguno?: string[];
  /** Si se indica, se usa como fallback en lugar del aviso por defecto. */
  fallback?: ReactNode;
  /** true => oculta silenciosamente (no renderiza nada). */
  silencioso?: boolean;
  children: ReactNode;
}

/**
 * Guard de UI por permisos. Oculta/deshabilita contenido según los permisos
 * efectivos del usuario (spec sección 3).
 */
export function RequierePermiso({
  permiso,
  alguno,
  fallback,
  silencioso = true,
  children,
}: RequierePermisoProps) {
  const { tiene, tieneAlguno } = usePermiso();

  let autorizado = true;
  if (permiso) autorizado = autorizado && tiene(permiso);
  if (alguno && alguno.length > 0) autorizado = autorizado && tieneAlguno(...alguno);

  if (autorizado) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  if (silencioso) return null;

  return (
    <EmptyState
      icon={<ShieldAlert className="h-6 w-6" />}
      title="Sin permisos"
      description="No cuentas con los permisos necesarios para ver esta sección."
    />
  );
}
