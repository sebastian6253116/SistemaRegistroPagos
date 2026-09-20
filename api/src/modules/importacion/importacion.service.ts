import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { auditar } from '../../lib/audit';
import { parseBankFile, type RowError } from './parser';

const CHUNK = 500;

export interface ImportOptions {
  cuentaRecaudadoraId: number;
  primeraFilaEsEncabezado?: boolean;
}

/** Builds the unique key used to detect duplicate bank movements. */
function movimientoKey(
  cuentaRecaudadoraId: number,
  referencia: string,
  montoBs: string,
  fecha: Date,
): string {
  return `${cuentaRecaudadoraId}|${referencia}|${montoBs}|${fecha.toISOString()}`;
}

/** Preview of the first 20 rows before confirming (spec 5.4). */
export function previsualizar(buffer: Buffer, filename: string, opts: ImportOptions) {
  const result = parseBankFile(buffer, filename, {
    primeraFilaEsEncabezado: opts.primeraFilaEsEncabezado,
  });

  return {
    filasTotales: result.filasTotales,
    erroresDeteccion: result.errors.length,
    filas: result.rows.slice(0, 20).map((r) => ({
      fila: r.fila,
      referencia: r.referencia,
      montoBs: r.montoBs.toString(),
      fechaEjecucion: r.fechaEjecucion.toISOString(),
    })),
    errores: result.errors.slice(0, 20),
  };
}

export interface ImportResultado {
  loteId: number;
  nombreArchivo: string;
  filasTotales: number;
  insertadas: number;
  duplicadas: number;
  conError: number;
  detalleErrores: RowError[];
}

/**
 * Imports a bank statement file (spec 5.4).
 *
 * - Processes in batches inside a transaction.
 * - A failing row is recorded with its line number and the import continues.
 * - Duplicates against the unique index are counted, not inserted.
 */
export async function importar(
  buffer: Buffer,
  filename: string,
  opts: ImportOptions,
  usuarioId: number,
  ip?: string,
): Promise<ImportResultado> {
  const cuenta = await prisma.cuentaRecaudadora.findUnique({
    where: { id: opts.cuentaRecaudadoraId },
  });
  if (!cuenta) throw ApiError.badRequest('Cuenta recaudadora no encontrada');

  const parsed = parseBankFile(buffer, filename, {
    primeraFilaEsEncabezado: opts.primeraFilaEsEncabezado,
  });
  if (parsed.filasTotales === 0) {
    throw ApiError.badRequest('El archivo no contiene filas de datos');
  }

  const errores: RowError[] = [...parsed.errors];

  // Pre-fetch existing keys for the referenced accounts within the file's date
  // span to detect duplicates without one query per row (no N+1).
  const fechas = parsed.rows.map((r) => r.fechaEjecucion.getTime());
  const minFecha = fechas.length ? new Date(Math.min(...fechas)) : new Date();
  const maxFecha = fechas.length ? new Date(Math.max(...fechas)) : new Date();
  maxFecha.setDate(maxFecha.getDate() + 1);
  const referencias = [...new Set(parsed.rows.map((r) => r.referencia))];

  const existentes = await prisma.movimientoBanco.findMany({
    where: {
      cuentaRecaudadoraId: opts.cuentaRecaudadoraId,
      referencia: { in: referencias.length ? referencias : undefined },
      fechaEjecucion: { gte: minFecha, lt: maxFecha },
    },
    select: { referencia: true, montoBs: true, fechaEjecucion: true },
  });

  const claves = new Set(
    existentes.map((m) =>
      movimientoKey(opts.cuentaRecaudadoraId, m.referencia, m.montoBs.toString(), m.fechaEjecucion),
    ),
  );

  const aInsertar: Prisma.MovimientoBancoCreateManyInput[] = [];
  let duplicadas = 0;

  for (const row of parsed.rows) {
    const key = movimientoKey(
      opts.cuentaRecaudadoraId,
      row.referencia,
      row.montoBs.toString(),
      row.fechaEjecucion,
    );
    if (claves.has(key)) {
      duplicadas++;
      errores.push({ fila: row.fila, motivo: 'Duplicado (ya existe en la cuenta)' });
      continue;
    }
    claves.add(key); // also de-duplicates within the same file
    aInsertar.push({
      cuentaRecaudadoraId: opts.cuentaRecaudadoraId,
      referencia: row.referencia,
      montoBs: row.montoBs,
      fechaEjecucion: row.fechaEjecucion,
    });
  }

  const insertadas = aInsertar.length;

  const resultado = await prisma.$transaction(async (tx) => {
    const lote = await tx.loteImportacion.create({
      data: {
        usuarioId,
        nombreArchivo: filename,
        filasTotales: parsed.filasTotales,
        insertadas,
        duplicadas,
        conError: errores.length,
        detalleErrores: errores.length ? (errores as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    for (let i = 0; i < aInsertar.length; i += CHUNK) {
      const chunk = aInsertar.slice(i, i + CHUNK);
      await tx.movimientoBanco.createMany({
        data: chunk.map((c) => ({ ...c, loteImportacionId: lote.id })),
      });
    }

    return lote;
  });

  await auditar({
    usuarioId,
    entidad: 'lotes_importacion',
    entidadId: resultado.id,
    accion: 'importar',
    datosDespues: {
      nombreArchivo: filename,
      cuentaRecaudadoraId: opts.cuentaRecaudadoraId,
      filasTotales: parsed.filasTotales,
      insertadas,
      duplicadas,
      conError: errores.length,
    },
    ip,
  });

  return {
    loteId: resultado.id,
    nombreArchivo: filename,
    filasTotales: parsed.filasTotales,
    insertadas,
    duplicadas,
    conError: errores.length,
    detalleErrores: errores,
  };
}

export async function listarLotes(query: Record<string, unknown>) {
  const params = parsePagination(query);
  const [rows, total] = await Promise.all([
    prisma.loteImportacion.findMany({
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
      include: {
        usuario: { select: { id: true, usuario: true, nombreCompleto: true } },
        _count: { select: { movimientos: true } },
      },
    }),
    prisma.loteImportacion.count(),
  ]);
  return paginate(rows, total, params);
}

export async function obtenerLote(id: number) {
  const lote = await prisma.loteImportacion.findUnique({
    where: { id },
    include: {
      usuario: { select: { id: true, usuario: true, nombreCompleto: true } },
      _count: { select: { movimientos: true } },
    },
  });
  if (!lote) throw ApiError.notFound('Lote de importacion no encontrado');
  return lote;
}

/** Error detail as CSV text (spec 5.4: downloadable error detail). */
export async function erroresLoteCsv(id: number): Promise<string> {
  const lote = await obtenerLote(id);
  const errores = (lote.detalleErrores as unknown as RowError[] | null) ?? [];
  const header = 'fila,motivo,columnas';
  const lines = errores.map((e) =>
    [e.fila, `"${String(e.motivo).replace(/"/g, '""')}"`, `"${(e.raw ?? []).join(' | ')}"`].join(','),
  );
  return [header, ...lines].join('\n');
}

/**
 * Builds the downloadable .xlsx import template (spec 5.4).
 *
 * Row 1 is a bold header so the file works with the UI default
 * (`primeraFilaEsEncabezado` = true). Row 2 is a single example row whose values
 * are obvious placeholders but still valid for the parser, so uploading the
 * untouched template yields 1 valid row and 0 detection errors.
 */
export async function generarPlantilla(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema de Gestion de Cobros';

  const ws = wb.addWorksheet('Movimientos');
  ws.columns = [
    { header: 'Referencia', key: 'referencia', width: 24 },
    { header: 'Monto en Bs', key: 'montoBs', width: 18 },
    { header: 'Fecha de ejecución', key: 'fechaEjecucion', width: 20 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };

  ws.addRow({
    referencia: 'EJEMPLO-0000',
    montoBs: '0,01',
    fechaEjecucion: '01/01/2000',
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
