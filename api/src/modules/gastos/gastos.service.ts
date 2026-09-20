import { Prisma } from '@prisma/client';
import { auditar, snapshot } from '../../lib/audit';
import { ApiError, paginate, type PaginationParams } from '../../lib/http';
import { calcularTasa } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { guardarArchivo } from '../../lib/upload';
import type {
  ActualizarGastoInput,
  CrearGastoInput,
  ListarGastosQuery,
} from './gastos.schema';

export interface GastosFiltros {
  fechaDesde?: string;
  fechaHasta?: string;
  categoria?: string;
  autorizadoPor?: string;
  registradoPor?: number;
}

const includeRegistrador = {
  registrador: {
    select: { id: true, nombreCompleto: true, usuario: true },
  },
} satisfies Prisma.GastoInclude;

type GastoConRegistrador = Prisma.GastoGetPayload<{ include: typeof includeRegistrador }>;

/** Serializes a gasto so Decimal(18,2)/(18,6) travel as strings. */
function serializar(row: GastoConRegistrador) {
  return {
    ...row,
    montoBs: row.montoBs.toString(),
    montoUsd: row.montoUsd.toString(),
    tasa: row.tasa.toString(),
  };
}

/** Parses a `YYYY-MM-DD` filter as a UTC day boundary (conventions "Dates"). */
function inicioDiaUTC(value?: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function finDiaUTC(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function buildWhere(filtros: GastosFiltros): Prisma.GastoWhereInput {
  const where: Prisma.GastoWhereInput = {};
  const desde = inicioDiaUTC(filtros.fechaDesde);
  const hasta = finDiaUTC(filtros.fechaHasta);
  if (desde || hasta) {
    const fecha: Prisma.DateTimeFilter = {};
    if (desde) fecha.gte = desde;
    if (hasta) fecha.lt = hasta;
    where.fecha = fecha;
  }
  if (filtros.categoria) where.categoria = filtros.categoria;
  if (filtros.autorizadoPor) where.autorizadoPor = { contains: filtros.autorizadoPor };
  if (filtros.registradoPor) where.registradoPor = filtros.registradoPor;
  return where;
}

/** Paginated, filtered list of expenses. Aggregation-free by design. */
export async function listar(filtros: GastosFiltros, params: PaginationParams) {
  const where = buildWhere(filtros);
  const [rows, total] = await Promise.all([
    prisma.gasto.findMany({
      where,
      include: includeRegistrador,
      orderBy: { fecha: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.gasto.count({ where }),
  ]);
  return paginate(rows.map(serializar), total, params);
}

export async function obtener(id: number) {
  const row = await prisma.gasto.findUnique({ where: { id }, include: includeRegistrador });
  if (!row) throw ApiError.notFound('Gasto no encontrado');
  return serializar(row);
}

export async function crear(input: CrearGastoInput, usuarioId: number, ip?: string) {
  const montoBs = new Prisma.Decimal(input.montoBs);
  const montoUsd = new Prisma.Decimal(input.montoUsd);
  let tasa: Prisma.Decimal;
  try {
    tasa = calcularTasa(montoBs, montoUsd);
  } catch (err) {
    throw ApiError.badRequest((err as Error).message);
  }

  const data: Prisma.GastoUncheckedCreateInput = {
    fecha: new Date(input.fecha),
    montoBs,
    montoUsd,
    tasa,
    movimientoBancoId: input.movimientoBancoId ?? null,
    referencia: input.referencia ?? null,
    descripcion: input.descripcion,
    categoria: input.categoria,
    autorizadoPor: input.autorizadoPor,
    registradoPor: usuarioId,
  };

  const row = await prisma.gasto.create({ data, include: includeRegistrador });
  await auditar({
    usuarioId,
    entidad: 'gastos',
    entidadId: row.id,
    accion: 'crear',
    datosDespues: snapshot(row),
    ip,
  });
  return serializar(row);
}

export async function actualizar(
  id: number,
  input: ActualizarGastoInput,
  usuarioId: number,
  ip?: string,
) {
  const actual = await prisma.gasto.findUnique({ where: { id }, include: includeRegistrador });
  if (!actual) throw ApiError.notFound('Gasto no encontrado');

  const montoBs = input.montoBs != null ? new Prisma.Decimal(input.montoBs) : actual.montoBs;
  const montoUsd = input.montoUsd != null ? new Prisma.Decimal(input.montoUsd) : actual.montoUsd;

  // The rate is always derived from both amounts; never accepted as input.
  let tasa = actual.tasa;
  if (input.montoBs != null || input.montoUsd != null) {
    try {
      tasa = calcularTasa(montoBs, montoUsd);
    } catch (err) {
      throw ApiError.badRequest((err as Error).message);
    }
  }

  const data: Prisma.GastoUncheckedUpdateInput = { montoBs, montoUsd, tasa };
  if (input.fecha !== undefined) data.fecha = new Date(input.fecha);
  if (input.descripcion !== undefined) data.descripcion = input.descripcion;
  if (input.categoria !== undefined) data.categoria = input.categoria;
  if (input.autorizadoPor !== undefined) data.autorizadoPor = input.autorizadoPor;
  if (input.movimientoBancoId !== undefined) data.movimientoBancoId = input.movimientoBancoId;
  if (input.referencia !== undefined) data.referencia = input.referencia;

  const row = await prisma.gasto.update({ where: { id }, data, include: includeRegistrador });
  await auditar({
    usuarioId,
    entidad: 'gastos',
    entidadId: id,
    accion: 'editar',
    datosAntes: snapshot(actual),
    datosDespues: snapshot(row),
    ip,
  });
  return serializar(row);
}

/** Hard delete (allowed by spec 5.5) with an audit trail. */
export async function eliminar(id: number, usuarioId: number, ip?: string) {
  const actual = await prisma.gasto.findUnique({ where: { id }, include: includeRegistrador });
  if (!actual) throw ApiError.notFound('Gasto no encontrado');

  await prisma.gasto.delete({ where: { id } });
  await auditar({
    usuarioId,
    entidad: 'gastos',
    entidadId: id,
    accion: 'borrar',
    datosAntes: snapshot(actual),
    ip,
  });
}

export async function subirSoporte(
  id: number,
  file: Express.Multer.File,
  usuarioId: number,
  ip?: string,
) {
  const actual = await prisma.gasto.findUnique({ where: { id }, include: includeRegistrador });
  if (!actual) throw ApiError.notFound('Gasto no encontrado');

  const soporteUrl = guardarArchivo(file);
  const row = await prisma.gasto.update({
    where: { id },
    data: { soporteUrl },
    include: includeRegistrador,
  });
  await auditar({
    usuarioId,
    entidad: 'gastos',
    entidadId: id,
    accion: 'editar',
    datosAntes: snapshot(actual),
    datosDespues: snapshot(row),
    ip,
  });
  return serializar(row);
}

/**
 * Expenses reduce cash flow. Exposed so the reportes module can subtract them
 * from validated income (spec 7 "Flujo de caja", 5.5).
 */
export async function sumGastosUsd(where: Prisma.GastoWhereInput = {}) {
  const agg = await prisma.gasto.aggregate({ where, _sum: { montoUsd: true } });
  return agg._sum.montoUsd ?? new Prisma.Decimal(0);
}

export async function sumGastosBs(where: Prisma.GastoWhereInput = {}) {
  const agg = await prisma.gasto.aggregate({ where, _sum: { montoBs: true } });
  return agg._sum.montoBs ?? new Prisma.Decimal(0);
}

export type { ListarGastosQuery };
