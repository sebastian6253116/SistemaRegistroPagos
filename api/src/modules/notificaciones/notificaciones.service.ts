import { Prisma } from '@prisma/client';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import type {
  CrearNotificacionInput,
  ListarNotificacionesQuery,
} from './notificaciones.schema';

/** Paginated list of the caller's own notifications, newest first. */
export async function listar(usuarioId: number, query: ListarNotificacionesQuery) {
  const params = parsePagination(query as unknown as Record<string, unknown>);
  const where: Prisma.NotificacionWhereInput = { usuarioId };
  if (query.soloNoLeidas) where.leida = false;

  const [data, total] = await Promise.all([
    prisma.notificacion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.notificacion.count({ where }),
  ]);

  return paginate(data, total, params);
}

/** Unread badge count for the caller. */
export async function contarNoLeidas(usuarioId: number): Promise<number> {
  return prisma.notificacion.count({ where: { usuarioId, leida: false } });
}

/**
 * Marks one notification as read. The update is scoped to `id AND usuarioId`,
 * so a user can never touch another user's notification; a 404 is returned when
 * no matching row exists (including the cross-user IDOR attempt).
 */
export async function marcarLeida(id: number, usuarioId: number) {
  const result = await prisma.notificacion.updateMany({
    where: { id, usuarioId },
    data: { leida: true },
  });
  if (result.count === 0) throw ApiError.notFound('Notificacion no encontrada');
  return prisma.notificacion.findUnique({ where: { id } });
}

/** Marks every unread notification of the caller as read. */
export async function marcarTodasLeidas(usuarioId: number): Promise<{ actualizadas: number }> {
  const result = await prisma.notificacion.updateMany({
    where: { usuarioId, leida: false },
    data: { leida: true },
  });
  return { actualizadas: result.count };
}

/**
 * Internal creation helper. NEVER throws: notifications are best-effort and
 * must not break the operation that triggered them (same safety principle as
 * `auditar` in src/lib/audit.ts).
 */
export async function crear(usuarioId: number, datos: CrearNotificacionInput): Promise<void> {
  try {
    await prisma.notificacion.create({
      data: {
        usuarioId,
        tipo: datos.tipo,
        titulo: datos.titulo,
        mensaje: datos.mensaje,
        entidad: datos.entidad ?? null,
        entidadId: datos.entidadId ?? null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Notification create failed:', err);
  }
}

/**
 * Resolves every active user holding `permisoClave` (Permiso -> RolPermiso ->
 * Usuario), deduplicates, optionally excludes the actor, and creates one
 * notification per recipient. Swallows every failure.
 */
export async function crearParaUsuariosConPermiso(
  permisoClave: string,
  datos: CrearNotificacionInput,
  excludeUsuarioId?: number,
): Promise<void> {
  try {
    const permiso = await prisma.permiso.findUnique({
      where: { clave: permisoClave },
      select: {
        roles: {
          select: {
            rol: {
              select: {
                usuarios: { where: { activo: true }, select: { id: true } },
              },
            },
          },
        },
      },
    });
    if (!permiso) return;

    const destinatarios = new Set<number>();
    for (const rp of permiso.roles) {
      for (const u of rp.rol.usuarios) destinatarios.add(u.id);
    }
    if (excludeUsuarioId != null) destinatarios.delete(excludeUsuarioId);

    await Promise.all([...destinatarios].map((id) => crear(id, datos)));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Notification dispatch failed:', err);
  }
}

/**
 * Resolves the user linked to a collector (Cobrador.usuarioId) and notifies
 * them. If the collector has no linked user, it silently does nothing.
 */
export async function crearParaCobrador(
  cobradorId: number,
  datos: CrearNotificacionInput,
): Promise<void> {
  try {
    const cobrador = await prisma.cobrador.findUnique({
      where: { id: cobradorId },
      select: { usuarioId: true },
    });
    if (!cobrador?.usuarioId) return;
    await crear(cobrador.usuarioId, datos);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Notification dispatch to collector failed:', err);
  }
}
