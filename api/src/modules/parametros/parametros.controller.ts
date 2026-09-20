import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/http';
import * as service from './parametros.service';
import type { Actor } from '../usuarios/usuarios.service';
import type { ListParametrosQuery } from './parametros.schema';

function actor(req: Request): Actor {
  return { usuarioId: req.user?.id ?? null, ip: req.ip };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListParametrosQuery;
  res.json(await service.list(query));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.update(req.params.clave, req.body, actor(req)));
});

export const bulkUpdate = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.bulkUpdate(req.body.parametros, actor(req)));
});
