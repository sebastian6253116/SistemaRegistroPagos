import { api } from './client';
import { cleanParams } from './helpers';
import type { MovimientoBanco, Paginated } from '@/types';

export async function listarMovimientos(
  params: Record<string, unknown>,
): Promise<Paginated<MovimientoBanco>> {
  const { data } = await api.get<Paginated<MovimientoBanco>>('/movimientos', {
    params: cleanParams(params),
  });
  return data;
}

export async function obtenerMovimiento(id: number): Promise<MovimientoBanco> {
  const { data } = await api.get<MovimientoBanco>(`/movimientos/${id}`);
  return data;
}

export async function eliminarMovimiento(id: number): Promise<void> {
  await api.delete(`/movimientos/${id}`);
}
