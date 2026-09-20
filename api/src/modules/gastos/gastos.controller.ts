import type { Request, Response } from 'express';
import { ApiError, asyncHandler, parsePagination } from '../../lib/http';
import { primerArchivo } from '../../lib/upload';
import * as service from './gastos.service';
import type { GastosFiltros } from './gastos.service';

function usuarioIdDe(req: Request): number {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function idDe(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Identificador invalido');
  return id;
}

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  const result = await service.listar(req.query as unknown as GastosFiltros, params);
  res.json(result);
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.obtener(idDe(req)));
});

export const crear = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.crear(req.body, usuarioIdDe(req), req.ip);
  res.status(201).json(row);
});

export const actualizar = asyncHandler(async (req: Request, res: Response) => {
  const row = await service.actualizar(idDe(req), req.body, usuarioIdDe(req), req.ip);
  res.json(row);
});

export const eliminar = asyncHandler(async (req: Request, res: Response) => {
  await service.eliminar(idDe(req), usuarioIdDe(req), req.ip);
  res.status(204).send();
});

export const subirSoporte = asyncHandler(async (req: Request, res: Response) => {
  const file = primerArchivo(req);
  if (!file) throw ApiError.badRequest('Debe adjuntar un archivo de soporte.');
  const row = await service.subirSoporte(idDe(req), file, usuarioIdDe(req), req.ip);
  res.json(row);
});
