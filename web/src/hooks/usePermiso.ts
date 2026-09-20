import { useAuth } from './useAuth';
import type { AuthUser } from '@/types';

export interface PermisoApi {
  user: AuthUser | null;
  status: ReturnType<typeof useAuth>['status'];
  tiene: (permiso: string) => boolean;
  tieneAlguno: (...permisos: string[]) => boolean;
  tieneTodos: (...permisos: string[]) => boolean;
}

/** Hook central de permisos: consulta los permisos efectivos del usuario. */
export function usePermiso(): PermisoApi {
  const { user, status, hasPermiso, hasAlguno } = useAuth();
  return {
    user,
    status,
    tiene: hasPermiso,
    tieneAlguno: (...permisos: string[]) => hasAlguno(permisos),
    tieneTodos: (...permisos: string[]) => permisos.every(hasPermiso),
  };
}
