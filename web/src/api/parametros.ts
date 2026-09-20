import { api } from './client';
import { cleanParams } from './helpers';
import type { Paginated, Parametro } from '@/types';

export async function listarParametros(
  params: Record<string, unknown>,
): Promise<Paginated<Parametro>> {
  const { data } = await api.get<Paginated<Parametro>>('/parametros', {
    params: cleanParams(params),
  });
  return data;
}

export async function actualizarParametro(
  clave: string,
  valor: string,
  descripcion?: string | null,
): Promise<Parametro> {
  const { data } = await api.put<Parametro>(`/parametros/${encodeURIComponent(clave)}`, {
    valor,
    descripcion,
  });
  return data;
}

export async function bulkActualizarParametros(
  parametros: { clave: string; valor: string }[],
): Promise<Parametro[]> {
  const { data } = await api.patch<{ data: Parametro[] }>('/parametros/bulk', { parametros });
  return data.data;
}
