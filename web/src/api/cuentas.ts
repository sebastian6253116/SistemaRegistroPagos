import { api } from './client';
import { cleanParams } from './helpers';
import type { CuentaRecaudadora, Paginated } from '@/types';

export interface CuentaInput {
  bancoId: number;
  numeroCuenta: string;
  alias?: string | null;
  activo?: boolean;
}

export async function listarCuentas(
  params: Record<string, unknown>,
): Promise<Paginated<CuentaRecaudadora>> {
  const { data } = await api.get<Paginated<CuentaRecaudadora>>('/cuentas', {
    params: cleanParams(params),
  });
  return data;
}

export async function crearCuenta(input: CuentaInput): Promise<CuentaRecaudadora> {
  const { data } = await api.post<CuentaRecaudadora>('/cuentas', input);
  return data;
}

export async function actualizarCuenta(
  id: number,
  input: Partial<CuentaInput>,
): Promise<CuentaRecaudadora> {
  const { data } = await api.put<CuentaRecaudadora>(`/cuentas/${id}`, input);
  return data;
}

export async function desactivarCuenta(id: number): Promise<void> {
  await api.delete(`/cuentas/${id}`);
}

export async function marcarCuentaDefault(id: number): Promise<CuentaRecaudadora> {
  const { data } = await api.put<CuentaRecaudadora>(`/cuentas/${id}/default`, {});
  return data;
}
