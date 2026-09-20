import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/http';
import * as service from './movimientos.service';

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listarMovimientos(req.query as never);
  res.json(result);
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  const mov = await service.obtenerMovimiento(Number(req.params.id));
  res.json(mov);
});
