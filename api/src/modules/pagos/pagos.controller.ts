import type { Request, Response } from 'express';
import { TipoConciliacion } from '@prisma/client';
import { ApiError, asyncHandler } from '../../lib/http';
import { primerArchivo } from '../../lib/upload';
import * as service from './pagos.service';
import * as conciliacion from '../conciliacion/conciliacion.service';

export const reportar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const pago = await service.reportarPago(req.body, req.user);
  res.status(201).json(pago);
});

export const listar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await service.listarPagos(req.query as never, req.user);
  res.json(result);
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const pago = await service.obtenerPago(Number(req.params.id), req.user);
  res.json(pago);
});

export const editar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const pago = await service.editarPago(Number(req.params.id), req.body, req.user, req.ip);
  res.json(pago);
});

export const subirSoporte = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const file = primerArchivo(req);
  if (!file) throw ApiError.badRequest('Debe adjuntar un archivo de soporte.');
  const pago = await service.subirSoporte(Number(req.params.id), file, req.user);
  res.json(pago);
});

export const eliminar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await service.eliminarPago(Number(req.params.id), req.user);
  res.status(204).send();
});

export const revertir = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const pago = await service.revertirPago(Number(req.params.id), req.body, req.user);
  res.json(pago);
});

export const coincidencias = asyncHandler(async (req: Request, res: Response) => {
  const result = await conciliacion.obtenerCoincidencias(Number(req.params.id));
  // `data` keeps the original array shape; `duplicado` is an additive signal.
  res.json({ data: result.coincidencias, duplicado: result.duplicado });
});

export const validar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const movimientoBancoId = req.body.movimientoBancoId as number | undefined;
  await conciliacion.validarPago({
    pagoReportadoId: Number(req.params.id),
    movimientoBancoId: movimientoBancoId ?? null,
    tipo: movimientoBancoId ? TipoConciliacion.manual : TipoConciliacion.automatica,
    usuarioId: req.user.id,
    ip: req.ip,
  });
  // Return the canonical serialized payment (consistent shape + string decimals).
  res.json(await service.obtenerPago(Number(req.params.id), req.user));
});

export const rechazar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await conciliacion.rechazarPago({
    pagoReportadoId: Number(req.params.id),
    motivoRechazo: req.body.motivoRechazo,
    usuarioId: req.user.id,
    ip: req.ip,
  });
  res.json(await service.obtenerPago(Number(req.params.id), req.user));
});

export const duplicado = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await conciliacion.marcarDuplicado({
    pagoReportadoId: Number(req.params.id),
    usuarioId: req.user.id,
    ip: req.ip,
  });
  res.json(await service.obtenerPago(Number(req.params.id), req.user));
});

export const validarLote = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await conciliacion.validarLote(req.body.items, req.user.id, req.ip);
  res.json(result);
});
