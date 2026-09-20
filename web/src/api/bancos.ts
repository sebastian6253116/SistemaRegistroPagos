import { api } from './client';
import { cleanParams } from './helpers';
import type { Banco, Paginated } from '@/types';

export interface BancoInput {
  nombre: string;
  codigo: string;
}

export async function listarBancos(params: Record<string, unknown>): Promise<Paginated<Banco>> {
  const { data } = await api.get<Paginated<Banco>>('/bancos', { params: cleanParams(params) });
  return data;
}

export async function crearBanco(input: BancoInput): Promise<Banco> {
  const { data } = await api.post<Banco>('/bancos', input);
  return data;
}

export async function actualizarBanco(id: number, input: Partial<BancoInput>): Promise<Banco> {
  const { data } = await api.put<Banco>(`/bancos/${id}`, input);
  return data;
}

export async function eliminarBanco(id: number): Promise<void> {
  await api.delete(`/bancos/${id}`);
}
