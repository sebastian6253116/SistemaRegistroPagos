import type { Request, Response } from 'express';
import { ApiError, asyncHandler } from '../../lib/http';
import * as service from './notificaciones.service';
import type { ListarNotificacionesQuery } from './notificaciones.schema';

function usuarioIdDe(req: Request): number {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listar(
    usuarioIdDe(req),
    req.query as unknown as ListarNotificacionesQuery,
  );
  res.json(result);
});

/**
 * Unread notifications for the caller: the paginated list plus the total
 * unread count, so the badge and the dropdown share one round-trip.
 */
export const noLeidas = asyncHandler(async (req: Request, res: Response) => {
  const usuarioId = usuarioIdDe(req);
  const query = req.query as unknown as ListarNotificacionesQuery;
  const [result, noLeidas] = await Promise.all([
    service.listar(usuarioId, { ...query, soloNoLeidas: true }),
    service.contarNoLeidas(usuarioId),
  ]);
  res.json({ ...result, noLeidas });
});

export const marcarLeida = asyncHandler(async (req: Request, res: Response) => {
  const notificacion = await service.marcarLeida(Number(req.params.id), usuarioIdDe(req));
  res.json(notificacion);
});

export const marcarTodasLeidas = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.marcarTodasLeidas(usuarioIdDe(req));
  res.json(result);
});
