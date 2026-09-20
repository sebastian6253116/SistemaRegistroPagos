import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/http';
import * as service from './bancos.service';
import type { Actor } from '../usuarios/usuarios.service';
import type { ListBancosQuery } from './bancos.schema';

function actor(req: Request): Actor {
  return { usuarioId: req.user?.id ?? null, ip: req.ip };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListBancosQuery;
  res.json(await service.list(query));
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.getById(Number(req.params.id)));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.create(req.body, actor(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.update(Number(req.params.id), req.body, actor(req)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.remove(Number(req.params.id), actor(req));
  res.status(204).send();
});
