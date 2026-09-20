import { Prisma, TipoCobro } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { auditar, snapshot } from '../../lib/audit';
import { calcularTasa } from '../../lib/money';
import { clasificarPorAntiguedad } from '../../lib/classification';
import { getConfigValues } from '../../lib/config-values';
import { evaluarVinculoConciliacion } from '../conciliacion/matcher';
import { pagoCasWhere } from './optimistic-lock';
import { guardarArchivo } from '../../lib/upload';
import { crearParaUsuariosConPermiso } from '../notificaciones/notificaciones.service';
import type { AuthUser } from '../../middleware/auth';
import type {
  EditarPagoInput,
  ListarPagosQuery,
  ReportarPagoInput,
  RevertirPagoInput,
} from './pagos.schema';

const PAGO_SELECT = {
  id: true,
  fechaPago: true,
  referencia: true,
  montoBs: true,
  montoUsd: true,
  tasa: true,
  cliente: true,
  concepto: true,
  tipoCobro: true,
  tipoCobroDerivado: true,
  revisarClasificacion: true,
  tipoPagoId: true,
  soporteUrl: true,
  observaciones: true,
  estado: true,
  motivoRechazo: true,
  validadoAt: true,
  createdAt: true,
  cobradorId: true,
  bancoOrigenId: true,
  cuentaRecaudadoraId: true,
  movimientoBancoId: true,
  cobrador: { select: { id: true, nombre: true, codigo: true } },
  tipoPago: { select: { id: true, nombre: true } },
  bancoOrigen: { select: { id: true, nombre: true, codigo: true } },
  cuentaRecaudadora: {
    select: { id: true, numeroCuenta: true, alias: true, banco: { select: { id: true, nombre: true } } },
  },
  movimientoBanco: {
    select: { id: true, referencia: true, montoBs: true, fechaEjecucion: true },
  },
  validador: { select: { id: true, nombreCompleto: true } },
} satisfies Prisma.PagoReportadoSelect;

/** Serializes Decimal fields as strings so JSON never loses precision. */
function serializePago<T extends Record<string, unknown>>(pago: T) {
  const out: Record<string, unknown> = { ...pago };
  for (const key of ['montoBs', 'montoUsd', 'tasa'] as const) {
    const v = out[key];
    if (v && typeof (v as { toString: () => string }).toString === 'function') {
      out[key] = (v as { toString: () => string }).toString();
    }
  }
  // A null source bank is a valid state (optional bank). Never emit `null` for
  // the bank name at the output boundary: render the literal "N/A" so every
  // consumer gets a stable string and never has to special-case it.
  if (out.bancoOrigen == null) {
    out.bancoOrigen = { id: null, nombre: 'N/A', codigo: 'N/A' };
  }
  const mov = out.movimientoBanco as Record<string, unknown> | null;
  if (mov && mov.montoBs != null) {
    mov.montoBs = (mov.montoBs as { toString: () => string }).toString();
  }
  return out;
}

/**
 * Collector data isolation (spec section 3).
 * A user with `pagos.ver_propios` but not `pagos.ver_todos` can only ever see
 * their own collector's payments — enforced in the data layer.
 */
export function whereConAislamiento(
  where: Prisma.PagoReportadoWhereInput,
  user: AuthUser,
): Prisma.PagoReportadoWhereInput {
  const verTodos = user.permisos.includes('pagos.ver_todos');
  if (verTodos) return where;
  if (!user.cobradorId) {
    // No collector linked: no payments are visible.
    return { ...where, cobradorId: -1 };
  }
  return { ...where, cobradorId: user.cobradorId };
}

/**
 * Validates an optional payment-method reference (tipos_pago). When provided it
 * must exist and be active; otherwise the caller gets a clear 400. Accepts a
 * transaction client so callers can keep the lookup inside their transaction.
 */
async function validarTipoPago(
  tipoPagoId?: number | null,
  client: Prisma.TransactionClient = prisma,
): Promise<void> {
  if (tipoPagoId == null) return;
  const tipo = await client.tipoPago.findUnique({ where: { id: tipoPagoId } });
  if (!tipo || !tipo.activo) {
    throw ApiError.badRequest('Tipo de pago no encontrado o inactivo');
  }
}

/**
 * Reports a payment (spec 5.1). The exchange rate is NEVER taken from input:
 * it is derived as monto_bs / monto_usd, rounded to 6 decimals, and persisted
 * together with both amounts.
 */
export async function reportarPago(input: ReportarPagoInput, user: AuthUser) {
  let cobradorId: number;

  if (input.cobradorId && user.permisos.includes('pagos.ver_todos')) {
    const cobrador = await prisma.cobrador.findUnique({ where: { id: input.cobradorId } });
    if (!cobrador) throw ApiError.badRequest('Cobrador no encontrado');
    cobradorId = cobrador.id;
  } else {
    if (!user.cobradorId) {
      throw ApiError.badRequest('El usuario no tiene un cobrador asociado para reportar pagos');
    }
    cobradorId = user.cobradorId;
  }

  // The source bank is configurable as required/optional via the
  // `pago.banco_origen_obligatorio` parameter. A null bank is a valid state
  // when the rule is disabled: NULL means "no bank specified" and is NEVER
  // faked with a catalog row.
  const config = await getConfigValues();
  const bancoOrigenId = input.bancoOrigenId ?? null;
  if (config.bancoOrigenObligatorio && bancoOrigenId == null) {
    throw ApiError.badRequest('El banco de origen es obligatorio.');
  }

  // Validate referenced catalogs exist.
  const [banco, cuenta] = await Promise.all([
    bancoOrigenId != null
      ? prisma.banco.findUnique({ where: { id: bancoOrigenId } })
      : Promise.resolve(null),
    prisma.cuentaRecaudadora.findUnique({ where: { id: input.cuentaRecaudadoraId } }),
  ]);
  if (bancoOrigenId != null && !banco) {
    throw ApiError.badRequest('Banco de origen no encontrado');
  }
  if (!cuenta) throw ApiError.badRequest('Cuenta recaudadora no encontrada');

  await validarTipoPago(input.tipoPagoId);

  // Rate is derived, never accepted as input.
  const tasa = calcularTasa(input.montoBs, input.montoUsd);

  // Vintage classification (spec 5.3): only derived when a document date is
  // known; otherwise the collector's mark is taken at face value.
  let tipoCobroDerivado: TipoCobro | null = null;
  let revisarClasificacion = false;
  if (input.fechaDocumento) {
    tipoCobroDerivado = clasificarPorAntiguedad(
      input.fechaDocumento,
      input.fechaPago,
      config.umbralAntiguedadDias,
    );
    revisarClasificacion = tipoCobroDerivado !== input.tipoCobro;
  }

  const creado = await prisma.pagoReportado.create({
    data: {
      cobradorId,
      fechaPago: input.fechaPago,
      referencia: input.referencia,
      bancoOrigenId,
      cuentaRecaudadoraId: input.cuentaRecaudadoraId,
      montoBs: new Prisma.Decimal(input.montoBs),
      montoUsd: new Prisma.Decimal(input.montoUsd),
      tasa,
      cliente: input.cliente,
      concepto: input.concepto,
      tipoPagoId: input.tipoPagoId ?? null,
      tipoCobro: input.tipoCobro,
      tipoCobroDerivado,
      revisarClasificacion,
      observaciones: input.observaciones,
      estado: 'pendiente',
    },
    select: PAGO_SELECT,
  });

  await auditar({
    usuarioId: user.id,
    entidad: 'pagos_reportados',
    entidadId: creado.id,
    accion: 'crear',
    datosDespues: snapshot(creado),
  });

  // Fire-and-forget style: the notification helper never throws, so a failure
  // here can never roll back or fail the payment report.
  await crearParaUsuariosConPermiso(
    'pagos.validar',
    {
      tipo: 'pago_reportado',
      titulo: 'Nuevo pago reportado',
      mensaje: `Se reporto el pago con referencia ${creado.referencia} por Bs ${creado.montoBs.toString()}.`,
      entidad: 'pago',
      entidadId: creado.id,
    },
    user.id,
  );

  return serializePago(creado as unknown as Record<string, unknown>);
}

function buildWhere(query: ListarPagosQuery): Prisma.PagoReportadoWhereInput {
  const where: Prisma.PagoReportadoWhereInput = {};

  if (query.fechaDesde || query.fechaHasta) {
    where.fechaPago = {};
    if (query.fechaDesde) (where.fechaPago as Prisma.DateTimeFilter).gte = query.fechaDesde;
    if (query.fechaHasta) {
      const hasta = new Date(query.fechaHasta);
      hasta.setDate(hasta.getDate() + 1);
      (where.fechaPago as Prisma.DateTimeFilter).lt = hasta;
    }
  }
  if (query.cobradorId) where.cobradorId = query.cobradorId;
  if (query.bancoOrigenId) where.bancoOrigenId = query.bancoOrigenId;
  if (query.cuentaRecaudadoraId) where.cuentaRecaudadoraId = query.cuentaRecaudadoraId;
  if (query.estado) where.estado = query.estado;
  if (query.tipoCobro) where.tipoCobro = query.tipoCobro;
  if (query.tipoPagoId) where.tipoPagoId = query.tipoPagoId;
  if (query.referencia) where.referencia = { contains: query.referencia };
  if (query.montoMin != null || query.montoMax != null) {
    where.montoUsd = {};
    if (query.montoMin != null) (where.montoUsd as Prisma.DecimalFilter).gte = query.montoMin;
    if (query.montoMax != null) (where.montoUsd as Prisma.DecimalFilter).lte = query.montoMax;
  }
  if (query.soloRevisar === 'true') where.revisarClasificacion = true;

  return where;
}

/** Paginated, filterable list with collector isolation enforced server-side. */
export async function listarPagos(query: ListarPagosQuery, user: AuthUser) {
  const params = parsePagination(query as unknown as Record<string, unknown>);
  const where = whereConAislamiento(buildWhere(query), user);

  const [rows, total] = await Promise.all([
    prisma.pagoReportado.findMany({
      where,
      select: PAGO_SELECT,
      orderBy: [{ fechaPago: 'desc' }, { id: 'desc' }],
      skip: params.skip,
      take: params.take,
    }),
    prisma.pagoReportado.count({ where }),
  ]);

  return paginate(rows.map((r) => serializePago(r as unknown as Record<string, unknown>)), total, params);
}

export async function obtenerPago(id: number, user: AuthUser) {
  const where = whereConAislamiento({ id }, user);
  const pago = await prisma.pagoReportado.findFirst({ where, select: PAGO_SELECT });
  if (!pago) throw ApiError.notFound('Pago reportado no encontrado');
  return serializePago(pago as unknown as Record<string, unknown>);
}

/** 409 raised when a payment changed since it was read (optimistic lock miss). */
function pagoModificadoError() {
  return ApiError.conflict(
    'El pago fue modificado por otro usuario. Recargue los datos e intente nuevamente.',
  );
}

/**
 * Edits a reported payment.
 *
 * - `pendiente`: no live reconciliation exists, so any permitted caller edits
 *   it in place. The audit stays best-effort and outside the transaction
 *   (unchanged behaviour).
 * - `validado`: requires the elevated `pagos.editar` permission. The link to the
 *   bank movement is re-evaluated with the NEW values inside a single
 *   transaction: if the match no longer holds, the edit is blocked (409) before
 *   any write; otherwise the payment is updated and the reconciliation's
 *   `diferenciaBs` is recalculated atomically with the audit entry.
 * - `rechazado` / `duplicado`: rejected with 409 (nothing live to recalculate).
 *
 * The state is ALWAYS re-read inside the transaction and the update is a
 * compare-and-swap against that fresh snapshot, so a concurrent edit,
 * validation or revert cannot be silently overwritten (409 instead).
 */
export async function editarPago(
  id: number,
  input: EditarPagoInput,
  user: AuthUser,
  ip?: string | null,
) {
  const where = whereConAislamiento({ id }, user);

  const resultado = await prisma.$transaction(async (tx) => {
    // Re-read INSIDE the transaction and branch on the FRESH state. Branching on
    // a read taken outside the transaction let a payment validated by another
    // user in between be edited through the "pending" path without re-evaluating
    // its bank-movement link.
    const pago = await tx.pagoReportado.findFirst({ where });
    if (!pago) throw ApiError.notFound('Pago reportado no encontrado');

    // Rejected and duplicated payments have no live reconciliation to recalculate.
    if (pago.estado === 'rechazado' || pago.estado === 'duplicado') {
      throw ApiError.conflict(`No se puede editar un pago en estado "${pago.estado}"`);
    }

    // Editing a validated payment is elevated: the route stays permissive so
    // collectors can still edit their own pending payments, but the extra
    // permission is enforced here, against the FRESH state.
    const esValidado = pago.estado === 'validado';
    if (esValidado && !user.permisos.includes('pagos.editar')) {
      throw ApiError.forbidden(
        'No tiene permiso para editar un pago validado. Se requiere el permiso "pagos.editar".',
      );
    }

    await validarTipoPago(input.tipoPagoId, tx);
    const config = await getConfigValues();

    // Partial-update semantics: an ABSENT bancoOrigenId leaves the stored bank
    // unchanged, while an explicit `null` clears it. The required/optional rule
    // is enforced on the effective (resulting) value, computed from the fresh row.
    const bancoOrigenId =
      input.bancoOrigenId !== undefined ? input.bancoOrigenId : pago.bancoOrigenId;
    if (config.bancoOrigenObligatorio && bancoOrigenId == null) {
      throw ApiError.badRequest('El banco de origen es obligatorio.');
    }
    if (bancoOrigenId != null) {
      const banco = await tx.banco.findUnique({ where: { id: bancoOrigenId } });
      if (!banco) throw ApiError.badRequest('Banco de origen no encontrado');
    }

    const montoBs = input.montoBs != null ? new Prisma.Decimal(input.montoBs) : pago.montoBs;
    const montoUsd = input.montoUsd != null ? new Prisma.Decimal(input.montoUsd) : pago.montoUsd;
    const cambioMontos = input.montoBs != null || input.montoUsd != null;
    const tasa = cambioMontos ? calcularTasa(montoBs, montoUsd) : pago.tasa;

    // Effective values after the partial update. These drive both the update and
    // the reconciliation re-evaluation below.
    const nuevaReferencia = input.referencia ?? pago.referencia;
    const nuevaCuentaRecaudadoraId = input.cuentaRecaudadoraId ?? pago.cuentaRecaudadoraId;
    const nuevaFechaPago = input.fechaPago ?? pago.fechaPago;

    const data = {
      referencia: nuevaReferencia,
      bancoOrigenId,
      cuentaRecaudadoraId: nuevaCuentaRecaudadoraId,
      fechaPago: nuevaFechaPago,
      cliente: input.cliente ?? pago.cliente,
      concepto: input.concepto ?? pago.concepto,
      tipoPagoId: input.tipoPagoId ?? pago.tipoPagoId,
      tipoCobro: input.tipoCobro ?? pago.tipoCobro,
      observaciones: input.observaciones ?? pago.observaciones,
      montoBs,
      montoUsd,
      tasa,
    };

    // Compare-and-swap: the update only lands if the row still matches the
    // snapshot read above. A concurrent edit/validation/revert makes this affect
    // 0 rows instead of silently overwriting the other change.
    const casWhere = pagoCasWhere(pago);

    // Pending path: no reconciliation exists, so the audit stays best-effort and
    // outside the transaction (unchanged behaviour). It is written after commit.
    if (!esValidado) {
      const { count } = await tx.pagoReportado.updateMany({ where: casWhere, data });
      if (count !== 1) throw pagoModificadoError();

      const actualizado = await tx.pagoReportado.findUniqueOrThrow({
        where: { id: pago.id },
        select: PAGO_SELECT,
      });

      return {
        actualizado,
        pendingAudit: {
          datosAntes: snapshot({
            montoBs: pago.montoBs.toString(),
            montoUsd: pago.montoUsd.toString(),
            tasa: pago.tasa.toString(),
            estado: pago.estado,
          }),
          datosDespues: snapshot({
            montoBs: montoBs.toString(),
            montoUsd: montoUsd.toString(),
            tasa: tasa.toString(),
          }),
        },
      };
    }

    // Validated path: re-evaluate the live link and recalculate the reconciliation
    // atomically. Every read and write runs in one transaction so the payment can
    // never end up validado with a broken link.
    if (pago.movimientoBancoId == null) {
      throw ApiError.conflict(
        'El pago validado no tiene un movimiento bancario asociado. Revierta la validacion antes de editar.',
      );
    }

    const movimiento = await tx.movimientoBanco.findUnique({
      where: { id: pago.movimientoBancoId },
      select: {
        id: true,
        referencia: true,
        montoBs: true,
        fechaEjecucion: true,
        cuentaRecaudadoraId: true,
      },
    });
    if (!movimiento) {
      throw ApiError.conflict(
        `El movimiento bancario vinculado (#${pago.movimientoBancoId}) ya no existe. Revierta la validacion antes de editar.`,
      );
    }

    const conciliacion = await tx.conciliacion.findUnique({
      where: { pagoReportadoId: pago.id },
    });

    // A validated payment with no reconciliation row is an inconsistent state:
    // the edit's contract is to always recalculate `diferenciaBs`, so it must be
    // rejected rather than silently skipping the recalculation. Do NOT create the
    // missing row as a "fix up".
    if (!conciliacion) {
      throw ApiError.conflict(
        'El pago esta validado pero no tiene una conciliacion bancaria asociada. No se puede editar sin recalcular la conciliacion; contacte a un administrador.',
      );
    }

    // Re-evaluate with the NEW payment values. A null result means the edit
    // breaks the match (reference/amount/date) or the account invariant, so it
    // must be blocked BEFORE any write.
    const vinculo = evaluarVinculoConciliacion(
      {
        referencia: nuevaReferencia,
        montoBs,
        fechaPago: nuevaFechaPago,
        cuentaRecaudadoraId: nuevaCuentaRecaudadoraId,
      },
      {
        id: movimiento.id,
        referencia: movimiento.referencia,
        montoBs: movimiento.montoBs,
        fechaEjecucion: movimiento.fechaEjecucion,
        cuentaRecaudadoraId: movimiento.cuentaRecaudadoraId,
      },
      config,
    );

    if (!vinculo) {
      throw ApiError.conflict(
        `La edicion rompe la conciliacion con el movimiento bancario #${movimiento.id} (referencia ${movimiento.referencia}, Bs ${movimiento.montoBs.toString()}). Revierta la validacion antes de editar.`,
        { movimientoBancoId: movimiento.id, referencia: movimiento.referencia },
      );
    }

    const { count } = await tx.pagoReportado.updateMany({ where: casWhere, data });
    if (count !== 1) throw pagoModificadoError();

    const actualizado = await tx.pagoReportado.findUniqueOrThrow({
      where: { id: pago.id },
      select: PAGO_SELECT,
    });

    // The link still holds: estado stays 'validado' and the stored difference is
    // refreshed against the movement's amount.
    const nuevaDiferenciaBs = montoBs.minus(movimiento.montoBs);
    await tx.conciliacion.update({
      where: { id: conciliacion.id },
      data: { diferenciaBs: nuevaDiferenciaBs },
    });

    // Audit inside the transaction so the recalculated difference and the payment
    // update can never land without a trace.
    await auditar(
      {
        usuarioId: user.id,
        entidad: 'pagos_reportados',
        entidadId: pago.id,
        accion: 'editar',
        datosAntes: snapshot({
          ...pago,
          diferenciaBs: conciliacion.diferenciaBs.toString(),
        }),
        datosDespues: snapshot({
          ...actualizado,
          diferenciaBs: nuevaDiferenciaBs.toString(),
        }),
        ip,
      },
      tx,
    );

    return { actualizado, pendingAudit: null };
  });

  // Best-effort audit for the pending path: deliberately OUTSIDE the transaction
  // and WITHOUT `tx`, so a failed audit write never aborts a routine edit.
  if (resultado.pendingAudit) {
    await auditar({
      usuarioId: user.id,
      entidad: 'pagos_reportados',
      entidadId: resultado.actualizado.id,
      accion: 'editar',
      datosAntes: resultado.pendingAudit.datosAntes,
      datosDespues: resultado.pendingAudit.datosDespues,
      ip,
    });
  }

  return serializePago(resultado.actualizado as unknown as Record<string, unknown>);
}

/**
 * Attaches support evidence to a pending payment. Collector isolation is
 * enforced by reusing `whereConAislamiento`, so a collector can only attach a
 * file to their OWN payment.
 */
export async function subirSoporte(id: number, file: Express.Multer.File, user: AuthUser) {
  const where = whereConAislamiento({ id }, user);
  const pago = await prisma.pagoReportado.findFirst({ where, select: PAGO_SELECT });
  if (!pago) throw ApiError.notFound('Pago reportado no encontrado');
  if (pago.estado !== 'pendiente') {
    throw ApiError.conflict(
      `No se puede adjuntar soporte a un pago en estado "${pago.estado}"`,
    );
  }

  const soporteUrl = guardarArchivo(file);
  const actualizado = await prisma.pagoReportado.update({
    where: { id: pago.id },
    data: { soporteUrl },
    select: PAGO_SELECT,
  });

  await auditar({
    usuarioId: user.id,
    entidad: 'pagos_reportados',
    entidadId: pago.id,
    accion: 'editar',
    datosAntes: snapshot({ soporteUrl: pago.soporteUrl }),
    datosDespues: snapshot({ soporteUrl }),
  });

  return serializePago(actualizado as unknown as Record<string, unknown>);
}

/**
 * Hard-deletes a reported payment. Only payments that are NOT `validado` can be
 * removed: a non-validated payment has no `conciliacion` row and no
 * `movimientoBancoId`, so it has no inbound references and leaves no orphans.
 * Collector isolation is enforced by reusing `whereConAislamiento`. The full
 * snapshot is written to the audit trail so the deleted record survives there.
 */
export async function eliminarPago(id: number, user: AuthUser): Promise<void> {
  const where = whereConAislamiento({ id }, user);
  const pago = await prisma.pagoReportado.findFirst({ where });
  if (!pago) throw ApiError.notFound('Pago reportado no encontrado');
  if (pago.estado === 'validado') {
    throw ApiError.conflict(
      'No se puede eliminar un pago validado. Revierta primero la validacion.',
    );
  }

  // The deletion is irreversible and the audit entry is the only surviving trace
  // of the record, so both must succeed or neither: `auditar` rethrows inside a
  // transaction, aborting the delete if the entry cannot be written.
  await prisma.$transaction(async (tx) => {
    await tx.pagoReportado.delete({ where: { id: pago.id } });
    await auditar(
      {
        usuarioId: user.id,
        entidad: 'pagos_reportados',
        entidadId: pago.id,
        accion: 'borrar',
        datosAntes: snapshot(pago),
      },
      tx,
    );
  });
}

/**
 * Reverts a validated payment (the exact inverse of `validarPago`). It must run
 * inside a single transaction: drop the `conciliacion` row, release the bank
 * movement back to `no_conciliado` so it can be matched again, and reset the
 * payment to the requested target state, clearing all validation fields.
 */
export async function revertirPago(id: number, input: RevertirPagoInput, user: AuthUser) {
  const where = whereConAislamiento({ id }, user);
  const pago = await prisma.pagoReportado.findFirst({ where });
  if (!pago) throw ApiError.notFound('Pago reportado no encontrado');
  if (pago.estado !== 'validado') {
    throw ApiError.conflict(
      `No se puede revertir un pago en estado "${pago.estado}": solo se revierte un pago validado`,
    );
  }

  // `motivoRechazo` only applies when reverting to `rechazado`.
  const motivoRechazo = input.estado === 'rechazado' ? (input.motivoRechazo ?? null) : null;

  const actualizado = await prisma.$transaction(async (tx) => {
    await tx.conciliacion.deleteMany({ where: { pagoReportadoId: pago.id } });

    if (pago.movimientoBancoId != null) {
      await tx.movimientoBanco.update({
        where: { id: pago.movimientoBancoId },
        data: { estadoConciliacion: 'no_conciliado' },
      });
    }

    const revertido = await tx.pagoReportado.update({
      where: { id: pago.id },
      data: {
        estado: input.estado,
        movimientoBancoId: null,
        validadoPor: null,
        validadoAt: null,
        motivoRechazo,
      },
      select: PAGO_SELECT,
    });

    // Audit inside the transaction: releasing the bank movement and dropping the
    // conciliacion must never happen without a trace of who did it and why.
    await auditar(
      {
        usuarioId: user.id,
        entidad: 'pagos_reportados',
        entidadId: pago.id,
        accion: 'editar',
        datosAntes: snapshot(pago),
        datosDespues: snapshot(revertido),
      },
      tx,
    );

    return revertido;
  });

  return serializePago(actualizado as unknown as Record<string, unknown>);
}
