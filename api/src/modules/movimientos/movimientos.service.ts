import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { auditar, snapshot } from '../../lib/audit';
import type { Actor } from '../usuarios/usuarios.service';
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

/**
 * Hard delete of a bank movement. Only a NON-reconciled movement may be removed:
 * a reconciled one is referenced by `pagos_reportados.movimiento_banco_id` and by
 * a `conciliaciones` row, so deleting it would orphan the reconciliation.
 *
 * The load, the guards and the delete share ONE transaction, mirroring
 * `usuarios.service.removeDefinitivo`: the counts read the transaction snapshot
 * and the delete re-checks the RESTRICT dependencies, so a movement reconciled
 * between the read and the delete surfaces as a clean 409 instead of a raw FK
 * error. Auditing inside the transaction makes the audit snapshot the only
 * surviving trace and guarantees both writes succeed or neither does.
 *
 * Import-batch origin (`loteImportacionId`) is intentionally NOT a blocker: the
 * batch is a historical import record, not a lock.
 */
export async function eliminarMovimiento(id: number, actor: Actor): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const movimiento = await tx.movimientoBanco.findUnique({ where: { id } });
    if (!movimiento) throw ApiError.notFound('Movimiento bancario no encontrado');

    const bloqueado =
      'No se puede eliminar el movimiento bancario porque esta conciliado. Revierta primero la conciliacion.';

    // Primary guard: the movement is reconciled.
    if (movimiento.estadoConciliacion === 'conciliado') {
      throw ApiError.conflict(bloqueado);
    }

    // Defensive guard against a movement wrongly left at `no_conciliado` and
    // against the read-then-delete race: any linked payment or conciliacion row
    // means the movement is in fact reconciled and must not be deleted.
    const [pagosVinculados, conciliaciones] = await Promise.all([
      tx.pagoReportado.count({ where: { movimientoBancoId: id } }),
      tx.conciliacion.count({ where: { movimientoBancoId: id } }),
    ]);
    if (pagosVinculados > 0 || conciliaciones > 0) {
      throw ApiError.conflict(bloqueado);
    }

    try {
      await tx.movimientoBanco.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        // Keep the raw FK error in the log: without it the dependent table that
        // fired is invisible, and errorHandler only logs errors it does not know.
        // eslint-disable-next-line no-console
        console.error('Hard delete blocked by a foreign key:', err);
        throw ApiError.conflict(
          'No se puede eliminar el movimiento bancario: adquirio datos asociados mientras se procesaba la solicitud. Recargue e intente de nuevo.',
        );
      }
      throw err;
    }

    // Auditing inside the transaction: the deletion is irreversible and the audit
    // entry is the only surviving trace of who performed it. `auditar` rethrows
    // inside a transaction, so a failed write aborts the whole delete.
    await auditar(
      {
        usuarioId: actor.usuarioId,
        entidad: 'movimientos_banco',
        entidadId: id,
        accion: 'borrar',
        datosAntes: snapshot(movimiento),
        ip: actor.ip,
      },
      tx,
    );
  });
}
