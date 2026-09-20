import { api } from './client';
import { cleanParams } from './helpers';
import type { Paginated, TipoPago, TipoPagoInput } from '@/types';

export async function listarTiposPago(
  params: Record<string, unknown>,
): Promise<Paginated<TipoPago>> {
  const { data } = await api.get<Paginated<TipoPago>>('/tipos-pago', {
    params: cleanParams(params),
  });
  return data;
}

export async function crearTipoPago(input: TipoPagoInput): Promise<TipoPago> {
  const { data } = await api.post<TipoPago>('/tipos-pago', input);
  return data;
}

export async function actualizarTipoPago(
  id: number,
  input: Partial<TipoPagoInput>,
): Promise<TipoPago> {
  const { data } = await api.put<TipoPago>(`/tipos-pago/${id}`, input);
  return data;
}

export async function eliminarTipoPago(id: number): Promise<void> {
  await api.delete(`/tipos-pago/${id}`);
}

export async function marcarTipoPagoDefault(id: number): Promise<TipoPago> {
  const { data } = await api.put<TipoPago>(`/tipos-pago/${id}/default`, {});
  return data;
}
