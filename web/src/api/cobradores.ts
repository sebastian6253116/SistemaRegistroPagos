import { api } from './client';
import { cleanParams } from './helpers';
import type { Cobrador, Paginated } from '@/types';

export interface CobradorInput {
  nombre: string;
  codigo: string;
  usuarioId?: number | null;
  activo?: boolean;
}

export async function listarCobradores(
  params: Record<string, unknown>,
): Promise<Paginated<Cobrador>> {
  const { data } = await api.get<Paginated<Cobrador>>('/cobradores', {
    params: cleanParams(params),
  });
  return data;
}

export async function crearCobrador(input: CobradorInput): Promise<Cobrador> {
  const { data } = await api.post<Cobrador>('/cobradores', input);
  return data;
}

export async function actualizarCobrador(
  id: number,
  input: Partial<CobradorInput>,
): Promise<Cobrador> {
  const { data } = await api.put<Cobrador>(`/cobradores/${id}`, input);
  return data;
}

export async function desactivarCobrador(id: number): Promise<void> {
  await api.delete(`/cobradores/${id}`);
}
