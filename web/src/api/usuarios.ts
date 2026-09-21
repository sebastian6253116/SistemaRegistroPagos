import { api } from './client';
import { cleanParams } from './helpers';
import type { Paginated, Usuario } from '@/types';

export interface UsuarioInput {
  nombreCompleto: string;
  usuario: string;
  email: string;
  password?: string;
  rolId: number;
  activo?: boolean;
}

export async function listarUsuarios(params: Record<string, unknown>): Promise<Paginated<Usuario>> {
  const { data } = await api.get<Paginated<Usuario>>('/usuarios', { params: cleanParams(params) });
  return data;
}

export async function crearUsuario(input: UsuarioInput): Promise<Usuario> {
  const { data } = await api.post<Usuario>('/usuarios', input);
  return data;
}

export async function actualizarUsuario(id: number, input: Partial<UsuarioInput>): Promise<Usuario> {
  const { data } = await api.put<Usuario>(`/usuarios/${id}`, input);
  return data;
}

export async function desactivarUsuario(id: number): Promise<void> {
  await api.delete(`/usuarios/${id}`);
}

export async function eliminarUsuarioDefinitivo(id: number): Promise<void> {
  await api.delete(`/usuarios/${id}/definitivo`);
}
