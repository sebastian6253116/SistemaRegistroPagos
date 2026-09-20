import { Prisma } from '@prisma/client';
import { paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import type { ListAuditoriaQuery } from './auditoria.schema';

const auditoriaSelect = {
  id: true,
  usuarioId: true,
  entidad: true,
  entidadId: true,
  accion: true,
  datosAntes: true,
  datosDespues: true,
  ip: true,
  createdAt: true,
  usuario: { select: { id: true, usuario: true, nombreCompleto: true } },
} satisfies Prisma.AuditoriaSelect;

type AuditoriaPayload = Prisma.AuditoriaGetPayload<{ select: typeof auditoriaSelect }>;

/** Read-only audit trail listing, newest first. */
export async function list(input: ListAuditoriaQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.AuditoriaWhereInput = {};

  if (input.usuarioId !== undefined) where.usuarioId = input.usuarioId;
  if (input.entidad) where.entidad = input.entidad;
  if (input.accion) where.accion = input.accion;

  if (input.fechaDesde || input.fechaHasta) {
    where.createdAt = {};
    if (input.fechaDesde) where.createdAt.gte = input.fechaDesde;
    if (input.fechaHasta) {
      where.createdAt.lte = new Date(input.fechaHasta.getTime() + 86_400_000 - 1);
    }
  }

  const [data, total] = await Promise.all([
    prisma.auditoria.findMany({
      where,
      select: auditoriaSelect,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.auditoria.count({ where }),
  ]);

  return paginate<AuditoriaPayload>(data, total, params);
}
