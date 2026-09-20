import type { Request, Response } from 'express';
import { ApiError, asyncHandler } from '../../lib/http';
import * as service from './importacion.service';

function requireFile(req: Request): Express.Multer.File {
  const file = req.file;
  if (!file) throw ApiError.badRequest('Debe adjuntar un archivo .xlsx o .csv en el campo "archivo"');
  return file;
}

export const previsualizar = asyncHandler(async (req: Request, res: Response) => {
  const file = requireFile(req);
  const cuentaRecaudadoraId = Number(req.query.cuentaRecaudadoraId);
  const primeraFilaEsEncabezado = req.query.primeraFilaEsEncabezado === 'true';

  const result = service.previsualizar(file.buffer, file.originalname, {
    cuentaRecaudadoraId,
    primeraFilaEsEncabezado,
  });
  res.json(result);
});

export const importar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const file = requireFile(req);
  const cuentaRecaudadoraId = Number(req.body.cuentaRecaudadoraId);
  const primeraFilaEsEncabezado = String(req.body.primeraFilaEsEncabezado) === 'true';

  const result = await service.importar(
    file.buffer,
    file.originalname,
    { cuentaRecaudadoraId, primeraFilaEsEncabezado },
    req.user.id,
    req.ip,
  );
  res.status(201).json(result);
});

export const listarLotes = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.listarLotes(req.query as Record<string, unknown>);
  res.json(result);
});

export const obtenerLote = asyncHandler(async (req: Request, res: Response) => {
  const lote = await service.obtenerLote(Number(req.params.id));
  res.json(lote);
});

export const erroresLote = asyncHandler(async (req: Request, res: Response) => {
  const csv = await service.erroresLoteCsv(Number(req.params.id));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="errores-lote-${req.params.id}.csv"`,
  );
  res.send(csv);
});

export const plantilla = asyncHandler(async (_req: Request, res: Response) => {
  const buffer = await service.generarPlantilla();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="plantilla-importacion-bancaria.xlsx"',
  );
  res.send(buffer);
});
