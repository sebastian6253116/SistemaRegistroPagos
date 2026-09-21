import type { EstadoPago, Prisma, TipoCobro } from '@prisma/client';
import { ApiError } from '../../lib/http';

/** 409 raised when a compare-and-swap update affected 0 rows. */
export function pagoModificadoError() {
  return ApiError.conflict(
    'El pago fue modificado por otro usuario. Recargue los datos e intente nuevamente.',
  );
}

/**
 * Snapshot of the fields that must not change between the read and the write of
 * an edit. The compare-and-swap `where` built from it is what turns a concurrent
 * modification into a hard failure instead of a silent lost update.
 */
export interface PagoLockSnapshot {
  id: number;
  estado: EstadoPago;
  movimientoBancoId: number | null;
  referencia: string;
  montoBs: Prisma.Decimal;
  montoUsd: Prisma.Decimal;
  tasa: Prisma.Decimal;
  fechaPago: Date;
  cuentaRecaudadoraId: number;
  bancoOrigenId: number | null;
  cliente: string | null;
  concepto: string | null;
  tipoPagoId: number | null;
  tipoCobro: TipoCobro;
  observaciones: string | null;
  updatedAt: Date;
}

/**
 * Builds the compare-and-swap `where` for a payment edit.
 *
 * The primary key alone is NOT enough: a plain `update({ where: { id } })`
 * blindly overwrites whatever is stored, so two concurrent edits silently lose
 * one another and an edit can land on a row that was validated/reverted after it
 * was read. Matching on the exact snapshot (including the reconciliation-relevant
 * fields and `updatedAt`) makes the update affect 1 row only when the row is
 * untouched; any concurrent change yields 0 rows, which callers turn into a 409.
 */
export function pagoCasWhere(snapshot: PagoLockSnapshot): Prisma.PagoReportadoWhereInput {
  return {
    id: snapshot.id,
    estado: snapshot.estado,
    movimientoBancoId: snapshot.movimientoBancoId,
    referencia: snapshot.referencia,
    montoBs: snapshot.montoBs,
    montoUsd: snapshot.montoUsd,
    tasa: snapshot.tasa,
    fechaPago: snapshot.fechaPago,
    cuentaRecaudadoraId: snapshot.cuentaRecaudadoraId,
    bancoOrigenId: snapshot.bancoOrigenId,
    cliente: snapshot.cliente,
    concepto: snapshot.concepto,
    tipoPagoId: snapshot.tipoPagoId,
    tipoCobro: snapshot.tipoCobro,
    observaciones: snapshot.observaciones,
    updatedAt: snapshot.updatedAt,
  };
}

/**
 * Reconciliation CAS snapshot: `validarPago` locks on these fields only, so an
 * unrelated concurrent write (e.g. `subirSoporte`, which only touches
 * `soporteUrl`) cannot cause a false 409. `editarPago` keeps the full snapshot
 * because for edit-vs-edit ANY field change is a real conflict.
 */
export type PagoReconciliacionSnapshot = Pick<
  PagoLockSnapshot,
  'id' | 'estado' | 'movimientoBancoId' | 'montoBs' | 'referencia' | 'fechaPago' | 'cuentaRecaudadoraId'
>;

/** Compare-and-swap `where` for the reconciliation decision (see the type above). */
export function pagoCasReconciliacionWhere(
  snapshot: PagoReconciliacionSnapshot,
): Prisma.PagoReportadoWhereInput {
  return {
    id: snapshot.id,
    estado: snapshot.estado,
    movimientoBancoId: snapshot.movimientoBancoId,
    montoBs: snapshot.montoBs,
    referencia: snapshot.referencia,
    fechaPago: snapshot.fechaPago,
    cuentaRecaudadoraId: snapshot.cuentaRecaudadoraId,
  };
}
