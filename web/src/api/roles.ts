import { api } from './client';
import { cleanParams } from './helpers';
import type { Paginated, PermisoGrupo, Rol } from '@/types';

export interface RolInput {
  nombre: string;
  descripcion?: string | null;
  permisos: string[];
}

export async function listarRoles(params: Record<string, unknown>): Promise<Paginated<Rol>> {
  const { data } = await api.get<Paginated<Rol>>('/roles', { params: cleanParams(params) });
  return data;
}

export async function getCatalogoPermisos(): Promise<PermisoGrupo[]> {
  const { data } = await api.get<{ data: PermisoGrupo[] }>('/roles/permisos');
  return data.data;
}

export async function crearRol(input: RolInput): Promise<Rol> {
  const { data } = await api.post<Rol>('/roles', input);
  return data;
}

export async function actualizarRol(id: number, input: Partial<RolInput>): Promise<Rol> {
  const { data } = await api.put<Rol>(`/roles/${id}`, input);
  return data;
}

export async function eliminarRol(id: number): Promise<void> {
  await api.delete(`/roles/${id}`);
}
