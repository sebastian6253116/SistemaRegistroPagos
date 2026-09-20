import { api } from './client';
import { cleanParams } from './helpers';
import type { BcvJobEstado, Paginated, TasaBcv } from '@/types';

/** Mirrors the backend SyncResult: a 200 response may still report a failed poll. */
export interface BcvSyncResult {
  insertada: boolean;
  motivo?: 'duplicado' | 'error';
  tasa?: TasaBcv;
  error?: string;
}

/** Null when no rate has been stored yet. */
export async function obtenerTasaBcvActual(): Promise<TasaBcv | null> {
  const { data } = await api.get<TasaBcv | null>('/tasas-bcv/actual');
  return data;
}

export async function listarHistorialBcv(
  params: Record<string, unknown>,
): Promise<Paginated<TasaBcv>> {
  const { data } = await api.get<Paginated<TasaBcv>>('/tasas-bcv/historial', {
    params: cleanParams(params),
  });
  return data;
}

export async function obtenerEstadoJobBcv(): Promise<BcvJobEstado> {
  const { data } = await api.get<BcvJobEstado>('/tasas-bcv/job');
  return data;
}

export async function actualizarEstadoJobBcv(habilitado: boolean): Promise<BcvJobEstado> {
  const { data } = await api.put<BcvJobEstado>('/tasas-bcv/job', { habilitado });
  return data;
}

export async function sincronizarBcv(): Promise<BcvSyncResult> {
  const { data } = await api.post<BcvSyncResult>('/tasas-bcv/sincronizar', {});
  return data;
}
