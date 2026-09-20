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
 * Compares the collector's mark with the derived classification.
 * Never overwrites the collector's value; only flags the mismatch.
 */
export function requiereRevision(
  marcado: TipoCobro,
  derivado: TipoCobro,
): boolean {
  return marcado !== derivado;
}
