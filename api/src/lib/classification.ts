import { TipoCobro } from '@prisma/client';

/**
 * Business rule 5.3: derive a "new vs. old" classification from the age of the
 * document/payment. A charge older than `umbralDias` is considered "viejo".
 *
 * NOTE: There is no invoices/debts module to anchor this to (assumption 2 in
 * the spec), so the reference date is the payment date itself combined with an
 * optional document date when supplied.
 *
 * This helper is no longer the source of `tipoCobroDerivado`: that
 * classification is now derived from the linked bank movement at validation
 * time (collector-reported `fechaPago` vs. movement `fechaEjecucion`). Kept for
 * API stability and future reuse.
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
 * Signed whole-day gap between the collector-reported payment date
 * (`fechaPago`) and the execution date of the linked bank movement
 * (`fechaEjecucionMovimiento`).
 *
 * Both sides are DATE columns (UTC midnight), so the difference is a whole
 * number of 24h days, floored. The result is:
 * - `0` when both dates are the same day ("del día");
 * - POSITIVE when the movement is EARLIER than the reported date, i.e. the
 *   payment is old;
 * - NEGATIVE when the movement is LATER than the reported date (informational,
 *   kept signed on purpose — callers must not clamp it).
 */
export function antiguedadEnDias(
  fechaPago: Date,
  fechaEjecucionMovimiento: Date,
): number {
  return Math.floor(
    (fechaPago.getTime() - fechaEjecucionMovimiento.getTime()) / 86_400_000,
  );
}

/**
 * True when a payment is "viejo" against the configured threshold
 * (`cobro.umbral_antiguedad_dias`), read as "a gap of N days OR MORE is old"
 * (`antiguedadDias >= umbralDias`). Note this is DIFFERENT from the strict
 * `>` style kept in the legacy `clasificarPorAntiguedad`.
 *
 * Border cases:
 * - With the owner's configured `1`, a 1-day gap IS old.
 * - A gap of `0` (movement executed the same day it was reported) is NOT old,
 *   as long as the threshold is greater than `0`.
 * - A NEGATIVE gap (movement executed AFTER the reported date) is NEVER old for
 *   any non-negative threshold: a negative value compared with `>=` a positive
 *   threshold is naturally false.
 * - Edge case: if the threshold is ever configured as `0`, then `0 >= 0` holds
 *   and a same-day movement becomes old too ("everything is old"). Negative
 *   gaps are still not old even then, because a negative value is never `>= 0`.
 *   The threshold is validated as a NON-NEGATIVE integer upstream
 *   (`UMBRAL_ANTIGUEDAD_DIAS`), and the production value is `1`, so this edge
 *   case does not occur in practice.
 */
export function esPagoViejo(antiguedadDias: number, umbralDias: number): boolean {
  return antiguedadDias >= umbralDias;
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
