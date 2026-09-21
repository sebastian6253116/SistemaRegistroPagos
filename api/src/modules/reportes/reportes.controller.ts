import type { Request, Response } from 'express';
import { asyncHandler, parsePagination } from '../../lib/http';
import * as service from './reportes.service';
import type { ReportFilters } from './reportes.service';
import type { ExportQuery, ReporteQuery, TipoReporte } from './reportes.schema';

function filtrosDe(req: Request): ReportFilters {
  const q = req.query as unknown as ReporteQuery;
  return {
    fechaDesde: q.fechaDesde,
    fechaHasta: q.fechaHasta,
    cobradorId: q.cobradorId,
    bancoId: q.bancoId,
    estado: q.estado,
  };
}

/**
 * Server-side gate for the "old document" alert. `authenticate` runs at the
 * router level so `req.user` is set; default to `false` (fail closed) otherwise.
 */
function puedeVerAlertaAntiguedad(req: Request): boolean {
  return req.user?.permisos.includes('pagos.ver_alerta_antiguedad') ?? false;
}

export const cobros = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  res.json(
    await service.cobros(filtrosDe(req), params, puedeVerAlertaAntiguedad(req)),
  );
});

export const porCobrador = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  res.json(await service.porCobrador(filtrosDe(req), params));
});

export const nuevoViejo = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  res.json(await service.nuevoViejo(filtrosDe(req), params));
});

export const tasas = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  res.json(await service.tasas(filtrosDe(req), params));
});

export const pendientes = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  res.json(await service.pendientes(filtrosDe(req), params));
});

export const movimientosNoConciliados = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  res.json(await service.movimientosNoConciliados(filtrosDe(req), params));
});

export const pagosSinRespaldo = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  res.json(
    await service.pagosSinRespaldo(filtrosDe(req), params, puedeVerAlertaAntiguedad(req)),
  );
});

export const flujoCaja = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  res.json(await service.flujoCaja(filtrosDe(req), params));
});

export const gastos = asyncHandler(async (req: Request, res: Response) => {
  const params = parsePagination(req.query as Record<string, unknown>);
  res.json(await service.gastos(filtrosDe(req), params));
});

function nombreArchivo(tipo: TipoReporte, f: ReportFilters, ext: string): string {
  const desde = f.fechaDesde ?? 'inicio';
  const hasta = f.fechaHasta ?? 'hoy';
  const nombre = `${tipo}_${desde}_${hasta}.${ext}`;
  return nombre.replace(/[^A-Za-z0-9._-]/g, '-');
}

function subtitulo(f: ReportFilters): string {
  const partes: string[] = [];
  partes.push(
    `Periodo: ${f.fechaDesde ?? 'inicio'} a ${f.fechaHasta ?? 'hoy'}`,
  );
  if (f.cobradorId) partes.push(`Cobrador: ${f.cobradorId}`);
  if (f.bancoId) partes.push(`Banco: ${f.bancoId}`);
  if (f.estado) partes.push(`Estado: ${f.estado}`);
  partes.push(`Generado: ${new Date().toISOString().slice(0, 10)}`);
  return partes.join('  |  ');
}

export const exportar = asyncHandler(async (req: Request, res: Response) => {
  const tipo = (req.params as unknown as { tipo: TipoReporte }).tipo;
  const q = req.query as unknown as ExportQuery;
  const filtros: ReportFilters = {
    fechaDesde: q.fechaDesde,
    fechaHasta: q.fechaHasta,
    cobradorId: q.cobradorId,
    bancoId: q.bancoId,
    estado: q.estado,
  };

  const reporte = await service.datosParaExport(tipo, filtros);

  if (q.formato === 'pdf') {
    const doc = service.generarPdf(reporte.titulo, subtitulo(filtros), reporte.bloques);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombreArchivo(tipo, filtros, 'pdf')}"`,
    );
    doc.pipe(res);
    doc.end();
    return;
  }

  const buffer = await service.generarExcel(reporte.bloques);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${nombreArchivo(tipo, filtros, 'xlsx')}"`,
  );
  res.send(buffer);
});
