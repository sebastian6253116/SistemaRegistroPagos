import { api } from './client';
import { cleanParams } from './helpers';
import type { AuditoriaItem, Paginated } from '@/types';

export async function listarAuditoria(
  params: Record<string, unknown>,
): Promise<Paginated<AuditoriaItem>> {
  const { data } = await api.get<Paginated<AuditoriaItem>>('/auditoria', {
    params: cleanParams(params),
  });
  return data;
}
