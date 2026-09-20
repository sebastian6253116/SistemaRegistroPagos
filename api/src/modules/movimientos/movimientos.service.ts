import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import type { ListarMovimientosQuery } from './movimientos.schema';

const MOV_SELECT = {
  id: true,
  referencia: true,
  montoBs: true,
  fechaEjecucion: true,
  estadoConciliacion: true,
  createdAt: true,
  cuentaRecaudadoraId: true,
  loteImportacionId: true,
  cuentaRecaudadora: {
    select: {
      id: true,
      numeroCuenta: true,
      alias: true,
      banco: { select: { id: true, nombre: true, codigo: true } },
    },
  },
  lote: { select: { id: true, nombreArchivo: true, createdAt: true } },
  pago: {
    select: {
      id: true,
      referencia: true,
      estado: true,
      cobrador: { select: { id: true, nombre: true, codigo: true } },
    },
  },
} satisfies Prisma.MovimientoBancoSelect;

function serialize<T extends Record<string, unknown>>(mov: T) {
  return { ...mov, montoBs: (mov.montoBs as { toString: () => string }).toString() };
}

export async function listarMovimientos(query: ListarMovimientosQuery) {
  const params = parsePagination(query as unknown as Record<string, unknown>);
  const where: Prisma.MovimientoBancoWhereInput = {};

  if (query.fechaDesde || query.fechaHasta) {
    where.fechaEjecucion = {};
    if (query.fechaDesde) (where.fechaEjecucion as Prisma.DateTimeFilter).gte = query.fechaDesde;
    if (query.fechaHasta) {
      const hasta = new Date(query.fechaHasta);
      hasta.setDate(hasta.getDate() + 1);
      (where.fechaEjecucion as Prisma.DateTimeFilter).lt = hasta;
    }
  }
  if (query.cuentaRecaudadoraId) where.cuentaRecaudadoraId = query.cuentaRecaudadoraId;
  if (query.loteImportacionId) where.loteImportacionId = query.loteImportacionId;
  if (query.estadoConciliacion) where.estadoConciliacion = query.estadoConciliacion;
  if (query.referencia) where.referencia = { contains: query.referencia };

  const [rows, total] = await Promise.all([
    prisma.movimientoBanco.findMany({
      where,
      select: MOV_SELECT,
      orderBy: [{ fechaEjecucion: 'desc' }, { id: 'desc' }],
      skip: params.skip,
      take: params.take,
    }),
    prisma.movimientoBanco.count({ where }),
  ]);

  return paginate(rows.map((r) => serialize(r as unknown as Record<string, unknown>)), total, params);
}

export async function obtenerMovimiento(id: number) {
  const mov = await prisma.movimientoBanco.findUnique({
    where: { id },
    select: {
      ...MOV_SELECT,
      conciliacion: {
        select: {
          id: true,
          tipo: true,
          diferenciaBs: true,
          createdAt: true,
          usuario: { select: { id: true, nombreCompleto: true } },
        },
      },
    },
  });
  if (!mov) throw ApiError.notFound('Movimiento bancario no encontrado');
  const out = serialize(mov as unknown as Record<string, unknown>);
  const conc = out.conciliacion as Record<string, unknown> | null;
  if (conc && conc.diferenciaBs != null) {
    conc.diferenciaBs = (conc.diferenciaBs as { toString: () => string }).toString();
  }
  return out;
}
