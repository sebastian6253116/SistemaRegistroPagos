import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/http';
import * as service from './tasas-bcv.service';
import type { Actor } from '../usuarios/usuarios.service';
import type { HistorialBcvQuery, JobConfigInput } from './tasas-bcv.schema';

function actor(req: Request): Actor {
  return { usuarioId: req.user?.id ?? null, ip: req.ip };
}

export const actual = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.obtenerActual());
});

export const historial = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as HistorialBcvQuery;
  res.json(await service.historial(query));
});

export const getJob = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.obtenerJobConfig());
});

export const updateJob = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.actualizarJobConfig(req.body as JobConfigInput, actor(req)));
});

export const sincronizar = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await service.sincronizar());
});
