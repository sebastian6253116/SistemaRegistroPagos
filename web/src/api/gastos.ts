import { api } from './client';
import { cleanParams } from './helpers';
import type { Gasto, Paginated } from '@/types';

export interface GastoInput {
  fecha: string;
  montoBs: string;
  montoUsd: string;
  movimientoBancoId?: number;
  referencia?: string;
  descripcion: string;
  categoria: string;
  autorizadoPor: string;
}

export async function listarGastos(params: Record<string, unknown>): Promise<Paginated<Gasto>> {
  const { data } = await api.get<Paginated<Gasto>>('/gastos', { params: cleanParams(params) });
  return data;
}

export async function crearGasto(input: GastoInput): Promise<Gasto> {
  const { data } = await api.post<Gasto>('/gastos', input);
  return data;
}

export async function actualizarGasto(id: number, input: Partial<GastoInput>): Promise<Gasto> {
  const { data } = await api.put<Gasto>(`/gastos/${id}`, input);
  return data;
}

export async function eliminarGasto(id: number): Promise<void> {
  await api.delete(`/gastos/${id}`);
}

export async function subirSoporte(id: number, archivo: File): Promise<Gasto> {
  const form = new FormData();
  form.append('soporte', archivo);
  const { data } = await api.post<Gasto>(`/gastos/${id}/soporte`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export const CATEGORIAS_GASTO = [
  'Operativo',
  'Administrativo',
  'Comisiones',
  'Transporte',
  'Servicios',
  'Nómina',
  'Otros',
];
