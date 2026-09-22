import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/http';
import * as service from './movimientos.service';
import type { Actor } from '../usuarios/usuarios.service';

function actor(req: Request): Actor {
  return { usuarioId: req.user?.id ?? null, ip: req.ip };
}

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listarMovimientos(req.query as never);
  res.json(result);
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  const mov = await service.obtenerMovimiento(Number(req.params.id));
  res.json(mov);
});

export const eliminar = asyncHandler(async (req: Request, res: Response) => {
  await service.eliminarMovimiento(Number(req.params.id), actor(req));
  res.status(204).send();
});
