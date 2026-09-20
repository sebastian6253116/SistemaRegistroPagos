import { api } from './client';
import { cleanParams } from './helpers';
import type { Paginated, TasaReferencia } from '@/types';

export interface TasaInput {
  fecha: string;
  valor: string;
  fuente?: string | null;
}

export async function listarTasas(
  params: Record<string, unknown>,
): Promise<Paginated<TasaReferencia>> {
  const { data } = await api.get<Paginated<TasaReferencia>>('/tasas', {
    params: cleanParams(params),
  });
  return data;
}

export async function crearTasa(input: TasaInput): Promise<TasaReferencia> {
  const { data } = await api.post<TasaReferencia>('/tasas', input);
  return data;
}

export async function actualizarTasa(id: number, input: Partial<TasaInput>): Promise<TasaReferencia> {
  const { data } = await api.put<TasaReferencia>(`/tasas/${id}`, input);
  return data;
}

export async function eliminarTasa(id: number): Promise<void> {
  await api.delete(`/tasas/${id}`);
}
