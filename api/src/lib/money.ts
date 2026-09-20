import { Prisma } from '@prisma/client';

const Decimal = Prisma.Decimal;
export type DecimalLike = Prisma.Decimal | string | number;

const CERO = new Decimal(0);

/** Coerces a value into a Prisma Decimal with a clear error for invalid input. */
export function toDecimal(value: DecimalLike): Prisma.Decimal {
  try {
    return new Decimal(value);
  } catch {
    throw new Error(`Valor numerico invalido: ${String(value)}`);
  }
}

/**
 * Business rule 5.1: the exchange rate is NEVER entered by hand. It is always
 * the result of dividing bolivares by dollars, rounded to 6 decimals.
 *
 * Both amounts must be greater than zero before dividing.
 *
 * @returns the rate rounded to 6 decimals, HALF_UP.
 */
export function calcularTasa(montoBs: DecimalLike, montoUsd: DecimalLike): Prisma.Decimal {
  const bs = toDecimal(montoBs);
  const usd = toDecimal(montoUsd);

  if (usd.lte(CERO)) {
    throw new Error('El monto en USD debe ser mayor a 0');
  }
  if (bs.lte(CERO)) {
    throw new Error('El monto en Bs debe ser mayor a 0');
  }

  // Division with the target scale then explicit HALF_UP rounding for
  // deterministic, spec-compliant results (e.g. 3600 / 20 = 180.000000).
  const raw = bs.div(usd);
  return raw.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

/**
 * Informational deviation (percentage) between an implicit rate and the
 * reference rate for the same date. Does not block anything (rule 5.1).
 *
 * @returns deviation as a percentage, or null when no reference is available.
 */
export function desviacionPorcentual(
  tasaImplicita: DecimalLike,
  tasaReferencia: DecimalLike | null | undefined,
): number | null {
  if (tasaReferencia == null) return null;
  const ref = toDecimal(tasaReferencia);
  if (ref.lte(CERO)) return null;
  const impl = toDecimal(tasaImplicita);
  const diff = impl.minus(ref).div(ref).times(100);
  return diff.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Weighted average rate = sum(monto_usd * tasa) / sum(monto_usd).
 * Returned as a plain number for reporting; the frontend only displays it.
 */
export function tasaPromedioPonderada(
  rows: { montoUsd: DecimalLike; tasa: DecimalLike }[],
): number | null {
  let numerador = CERO;
  let denominador = CERO;
  for (const r of rows) {
    const usd = toDecimal(r.montoUsd);
    const tasa = toDecimal(r.tasa);
    numerador = numerador.plus(usd.times(tasa));
    denominador = denominador.plus(usd);
  }
  if (denominador.lte(CERO)) return null;
  return numerador.div(denominador).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber();
}

/** Rounds to 2 decimals (money). */
export function roundMoney(value: DecimalLike): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
