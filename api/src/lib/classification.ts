import { TipoCobro } from '@prisma/client';

/**
 * Business rule 5.3: derive a "new vs. old" classification from the age of the
 * document/payment. A charge older than `umbralDias` is considered "viejo".
 *
 * NOTE: There is no invoices/debts module to anchor this to (assumption 2 in
 * the spec), so the reference date is the payment date itself combined with an
 * optional document date when supplied.
 */
export function clasificarPorAntiguedad(
  fechaDocumento: Date | null | undefined,
  fechaPago: Date,
  umbralDias: number,
): TipoCobro {
  if (!fechaDocumento) return TipoCobro.nuevo;
  const diffMs = fechaPago.getTime() - fechaDocumento.getTime();
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  return diffDias > umbralDias ? TipoCobro.viejo : TipoCobro.nuevo;
}

/**
 * "Old document vs. bank movement" alert.
 *
 * A collector can report a payment TODAY whose `fechaPago` is OLD, and the bank
 * movement it gets reconciled against has a CURRENT `fechaEjecucion`: the
 * document travelled a long time before the money actually moved. This is a
 * DIFFERENT signal from `clasificarPorAntiguedad` (which compares the payment
 * against an optional document date), so it is derived from the movement date.
 *
 * Returns the whole-day gap (complete 24h periods, same strict "greater than"
 * rule as `clasificarPorAntiguedad`) when the movement's execution date is MORE
 * THAN `umbralDias` days AFTER the payment date, or `null` when the payment is
 * not flagged (no movement date, movement on/before the payment, or the gap is
 * within the threshold — exactly the threshold is NOT flagged).
 */
export function alertaAntiguedadDocumento(
  fechaPago: Date | null | undefined,
  fechaEjecucionMovimiento: Date | null | undefined,
  umbralDias: number,
): number | null {
  if (!fechaPago || !fechaEjecucionMovimiento) return null;
  const diffMs = fechaEjecucionMovimiento.getTime() - fechaPago.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDias > umbralDias ? diffDias : null;
}

/**
 * Whole-day age of a payment, counted from TODAY in UTC.
 *
 * `fechaPago` is a DATE column (UTC midnight), so `hoyUTC` is the matching UTC
 * midnight and the gap is a whole number of 24h days, floored. A payment dated
 * today is `0`; a future-dated payment yields a NEGATIVE value, kept signed on
 * purpose (callers must not clamp it).
 */
export function antiguedadEnDias(fechaPago: Date, hoyUTC: Date): number {
  return Math.floor((hoyUTC.getTime() - fechaPago.getTime()) / 86_400_000);
}

/**
 * True when a payment is "viejo" against the configured threshold
 * (`cobro.umbral_antiguedad_dias`). Same STRICT "greater than" style as
 * `alertaAntiguedadDocumento` and `clasificarPorAntiguedad`: exactly at the
 * threshold is NOT old, and a negative age is never old.
 */
export function esPagoViejo(antiguedadDias: number, umbralDias: number): boolean {
  return antiguedadDias > umbralDias;
}

/**
 * Compares the collector's mark with the derived classification.
 * Never overwrites the collector's value; only flags the mismatch.
 */
export function requiereRevision(
  marcado: TipoCobro,
  derivado: TipoCobro,
): boolean {
  return marcado !== derivado;
}
