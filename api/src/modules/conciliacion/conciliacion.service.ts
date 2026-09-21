import { Prisma, TipoConciliacion } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/http';
import { auditar, snapshot } from '../../lib/audit';
import { crearParaCobrador } from '../notificaciones/notificaciones.service';
import { pagoCasReconciliacionWhere, pagoModificadoError } from '../pagos/optimistic-lock';
import { buscarCoincidencias, buscarDuplicado } from './matcher';

/**
 * Reconciliation operations (spec section 5.2).
 * Confirming a match: payment -> validado, movement -> conciliado, a
 * `conciliaciones` row is created and the action is audited.
 */

export async function obtenerCoincidencias(pagoId: number) {
  const pago = await prisma.pagoReportado.findUnique({
    where: { id: pagoId },
    select: {
      id: true,
      referencia: true,
      montoBs: true,
      montoUsd: true,
      tasa: true,
      fechaPago: true,
      cuentaRecaudadoraId: true,
      estado: true,
    },
  });
  if (!pago) throw ApiError.notFound('Pago reportado no encontrado');
  if (pago.estado !== 'pendiente') {
    throw ApiError.conflict(`El pago esta en estado "${pago.estado}" y no admite conciliacion`);
  }
  const [coincidencias, duplicado] = await Promise.all([
    buscarCoincidencias(pago),
    buscarDuplicado(pago),
  ]);
  return { coincidencias, duplicado };
}

export interface ValidarInput {
  pagoReportadoId: number;
  movimientoBancoId?: number | null;
  tipo?: TipoConciliacion;
  usuarioId: number;
  ip?: string;
}

/**
 * Validates a reported payment against a bank movement.
 * When `movimientoBancoId` is omitted, the best automatic suggestion is used.
 */
export async function validarPago(input: ValidarInput) {
  const { pagoReportadoId, usuarioId } = input;

  const resultado = await prisma.$transaction(async (tx) => {
    // Re-read INSIDE the transaction and branch on the FRESH state: the payment
    // must not change between this read and the reconciliation write, or
    // `diferenciaBs` would be stored from amounts the payment no longer has and
    // the 409 guard below would compare against a stale snapshot.
    const pago = await tx.pagoReportado.findUnique({
      where: { id: pagoReportadoId },
      include: { cobrador: { select: { id: true, nombre: true, codigo: true } } },
    });
    if (!pago) throw ApiError.notFound('Pago reportado no encontrado');
    if (pago.estado !== 'pendiente') {
      throw ApiError.conflict(`El pago ya fue procesado (estado "${pago.estado}")`);
    }

    let movimientoId = input.movimientoBancoId ?? null;
    let tipo = input.tipo ?? TipoConciliacion.manual;

    if (movimientoId == null) {
      // Automatic suggestion path. CR-001 R3: closing automatically is unsafe when
      // the payment matches a movement already reconciled with another payment, so
      // the duplicate signal forces the validator to pick the movement manually.
      const duplicado = await buscarDuplicado(pago, undefined, tx);
      if (duplicado) {
        throw ApiError.conflict(
          'El pago coincide con un movimiento bancario ya conciliado con otro pago. ' +
            'No se puede validar automaticamente: seleccione manualmente el movimiento para validarlo.',
        );
      }

      // Shares this transaction's snapshot instead of the global client.
      const coincidencias = await buscarCoincidencias(pago, undefined, tx);
      const mejor = coincidencias[0];
      if (!mejor) {
        throw ApiError.badRequest(
          'No se encontro ningun movimiento bancario compatible para este pago',
        );
      }
      movimientoId = mejor.movimiento.id;
      tipo = TipoConciliacion.automatica;
    }

    const movimiento = await tx.movimientoBanco.findUnique({
      where: { id: movimientoId },
      include: { pago: { select: { id: true } } },
    });
    if (!movimiento) throw ApiError.notFound('Movimiento bancario no encontrado');
    if (movimiento.cuentaRecaudadoraId !== pago.cuentaRecaudadoraId) {
      throw ApiError.badRequest('El movimiento no pertenece a la cuenta recaudadora del pago');
    }
    if (movimiento.estadoConciliacion === 'conciliado' || movimiento.pago) {
      throw ApiError.conflict('El movimiento bancario ya esta conciliado con otro pago');
    }

    const diferenciaBs = pago.montoBs.minus(movimiento.montoBs);

    const conciliacion = await tx.conciliacion.create({
      data: {
        pagoReportadoId: pago.id,
        movimientoBancoId: movimiento.id,
        usuarioId,
        tipo,
        diferenciaBs,
      },
    });

    // Compare-and-swap on the reconciliation-relevant fields only: a concurrent
    // change to any of them yields 0 rows -> 409, while `soporteUrl` is excluded
    // so `subirSoporte` cannot cause a false 409.
    const { count } = await tx.pagoReportado.updateMany({
      where: pagoCasReconciliacionWhere(pago),
      data: {
        estado: 'validado',
        movimientoBancoId: movimiento.id,
        validadoPor: usuarioId,
        validadoAt: new Date(),
        motivoRechazo: null,
      },
    });
    if (count !== 1) throw pagoModificadoError();

    const pagoActualizado = await tx.pagoReportado.findUniqueOrThrow({
      where: { id: pago.id },
    });

    await tx.movimientoBanco.update({
      where: { id: movimiento.id },
      data: { estadoConciliacion: 'conciliado' },
    });

    return { pago, conciliacion, pagoActualizado };
  });

  await auditar({
    usuarioId,
    entidad: 'pagos_reportados',
    entidadId: resultado.pago.id,
    accion: 'validar',
    datosAntes: snapshot(resultado.pago),
    datosDespues: snapshot(resultado.pagoActualizado),
    ip: input.ip,
  });

  await crearParaCobrador(resultado.pago.cobradorId, {
    tipo: 'pago_validado',
    titulo: 'Pago validado',
    mensaje: `Su pago con referencia ${resultado.pago.referencia} por Bs ${resultado.pago.montoBs.toString()} fue validado.`,
    entidad: 'pago',
    entidadId: resultado.pago.id,
  });

  return resultado.pagoActualizado;
}

/** Rejects a reported payment. A reason is mandatory (spec 5.2). */
export async function rechazarPago(params: {
  pagoReportadoId: number;
  motivoRechazo: string;
  usuarioId: number;
  ip?: string;
}) {
  const pago = await prisma.pagoReportado.findUnique({
    where: { id: params.pagoReportadoId },
  });
  if (!pago) throw ApiError.notFound('Pago reportado no encontrado');
  if (pago.estado === 'validado') {
    throw ApiError.conflict('No se puede rechazar un pago ya validado');
  }

  const actualizado = await prisma.pagoReportado.update({
    where: { id: pago.id },
    data: {
      estado: 'rechazado',
      motivoRechazo: params.motivoRechazo,
      validadoPor: params.usuarioId,
      validadoAt: new Date(),
    },
  });

  await auditar({
    usuarioId: params.usuarioId,
    entidad: 'pagos_reportados',
    entidadId: pago.id,
    accion: 'rechazar',
    datosAntes: snapshot(pago),
    datosDespues: snapshot(actualizado),
    ip: params.ip,
  });

  await crearParaCobrador(pago.cobradorId, {
    tipo: 'pago_rechazado',
    titulo: 'Pago rechazado',
    mensaje: `Su pago con referencia ${pago.referencia} fue rechazado. Motivo: ${params.motivoRechazo}`,
    entidad: 'pago',
    entidadId: pago.id,
  });

  return actualizado;
}

/** Flags a reported payment as duplicated. */
export async function marcarDuplicado(params: {
  pagoReportadoId: number;
  usuarioId: number;
  ip?: string;
}) {
  const pago = await prisma.pagoReportado.findUnique({
    where: { id: params.pagoReportadoId },
  });
  if (!pago) throw ApiError.notFound('Pago reportado no encontrado');

  const actualizado = await prisma.pagoReportado.update({
    where: { id: pago.id },
    data: { estado: 'duplicado', validadoPor: params.usuarioId, validadoAt: new Date() },
  });

  await auditar({
    usuarioId: params.usuarioId,
    entidad: 'pagos_reportados',
    entidadId: pago.id,
    accion: 'editar',
    datosAntes: snapshot(pago),
    datosDespues: snapshot(actualizado),
    ip: params.ip,
  });

  return actualizado;
}

export interface LoteItem {
  pagoReportadoId: number;
  movimientoBancoId: number;
}

export interface LoteResultado {
  procesados: number;
  errores: { pagoReportadoId: number; motivo: string }[];
}

/**
 * Bulk validation for exact matches. All-or-nothing per transaction; each item
 * is validated with the same invariants as a single validation.
 */
export async function validarLote(
  items: LoteItem[],
  usuarioId: number,
  ip?: string,
): Promise<LoteResultado> {
  if (items.length === 0) throw ApiError.badRequest('No se enviaron pagos para validar');

  const resultado = await prisma.$transaction(async (tx) => {
    let procesados = 0;
    const errores: { pagoReportadoId: number; motivo: string }[] = [];
    const validados: {
      id: number;
      cobradorId: number;
      referencia: string;
      montoBs: Prisma.Decimal;
    }[] = [];

    for (const item of items) {
      const pago = await tx.pagoReportado.findUnique({
        where: { id: item.pagoReportadoId },
      });
      if (!pago || pago.estado !== 'pendiente') {
        errores.push({ pagoReportadoId: item.pagoReportadoId, motivo: 'Pago no pendiente' });
        continue;
      }

      // CR-001 R3: never bulk-validate a duplicate; leave it for manual review.
      // Uses `tx` so movements reconciled earlier in this same batch are visible.
      const duplicado = await buscarDuplicado(pago, undefined, tx);
      if (duplicado) {
        errores.push({
          pagoReportadoId: item.pagoReportadoId,
          motivo:
            'El pago coincide con un movimiento ya conciliado con otro pago (posible duplicado)',
        });
        continue;
      }

      const movimiento = await tx.movimientoBanco.findUnique({
        where: { id: item.movimientoBancoId },
      });
      if (!movimiento || movimiento.estadoConciliacion !== 'no_conciliado') {
        errores.push({
          pagoReportadoId: item.pagoReportadoId,
          motivo: 'Movimiento no disponible',
        });
        continue;
      }
      if (movimiento.cuentaRecaudadoraId !== pago.cuentaRecaudadoraId) {
        errores.push({
          pagoReportadoId: item.pagoReportadoId,
          motivo: 'Cuenta recaudadora distinta',
        });
        continue;
      }

      await tx.conciliacion.create({
        data: {
          pagoReportadoId: pago.id,
          movimientoBancoId: movimiento.id,
          usuarioId,
          tipo: TipoConciliacion.automatica,
          diferenciaBs: pago.montoBs.minus(movimiento.montoBs),
        },
      });
      await tx.pagoReportado.update({
        where: { id: pago.id },
        data: {
          estado: 'validado',
          movimientoBancoId: movimiento.id,
          validadoPor: usuarioId,
          validadoAt: new Date(),
        },
      });
      await tx.movimientoBanco.update({
        where: { id: movimiento.id },
        data: { estadoConciliacion: 'conciliado' },
      });
      validados.push({
        id: pago.id,
        cobradorId: pago.cobradorId,
        referencia: pago.referencia,
        montoBs: pago.montoBs,
      });
      procesados++;
    }

    return { procesados, errores, validados };
  });

  await auditar({
    usuarioId,
    entidad: 'pagos_reportados',
    accion: 'validar',
    datosDespues: { validacion_lote: resultado } as unknown as Prisma.InputJsonValue,
    ip,
  });

  // Notify each affected collector. The helper never throws.
  await Promise.all(
    resultado.validados.map((pago) =>
      crearParaCobrador(pago.cobradorId, {
        tipo: 'pago_validado',
        titulo: 'Pago validado',
        mensaje: `Su pago con referencia ${pago.referencia} por Bs ${pago.montoBs.toString()} fue validado.`,
        entidad: 'pago',
        entidadId: pago.id,
      }),
    ),
  );

  return { procesados: resultado.procesados, errores: resultado.errores };
}
