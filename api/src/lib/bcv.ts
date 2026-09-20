/**
 * Pure parser for the external BCV rates API (api.farmavid.com.ve).
 *
 * The endpoint returns only the latest value; our `tasas_bcv` table is the
 * history. This rate is strictly informational for the app header and is
 * completely unrelated to the derived rate of the payment report form.
 *
 * This is a pure library: it must not import Express, Prisma or `ApiError`.
 */

export interface ParsedBcvRate {
  /** External uuid; dedupe key so repeated polls never insert duplicates. */
  apiId: string;
  /** UTC calendar date of the rate (time stripped to 00:00:00 UTC). */
  fecha: Date;
  /** USD value as a decimal string (full precision, no rounding). */
  usd: string;
  /** Raw `source` when present, otherwise null. */
  fuente: string | null;
  /** Raw timestamp returned by the API. */
  fechaApi: Date;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates and normalizes a raw BCV payload.
 * Throws a clear Error identifying the offending field on any invalid input.
 */
export function parsearRespuestaBcv(payload: unknown): ParsedBcvRate {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid BCV response: expected a non-null object');
  }

  const apiId = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!apiId) {
    throw new Error('Invalid BCV response: "id" must be a non-empty string');
  }

  if (typeof payload.date !== 'string' || payload.date.trim() === '') {
    throw new Error('Invalid BCV response: "date" must be a non-empty string');
  }
  const fechaApi = new Date(payload.date);
  if (Number.isNaN(fechaApi.getTime())) {
    throw new Error('Invalid BCV response: "date" is not a valid date');
  }

  let usdNumber: number;
  if (typeof payload.usd === 'number') {
    usdNumber = payload.usd;
  } else if (typeof payload.usd === 'string' && payload.usd.trim() !== '') {
    usdNumber = Number(payload.usd);
  } else {
    throw new Error('Invalid BCV response: "usd" is required');
  }
  if (!Number.isFinite(usdNumber)) {
    throw new Error('Invalid BCV response: "usd" must be a finite number');
  }
  if (usdNumber <= 0) {
    throw new Error('Invalid BCV response: "usd" must be greater than 0');
  }

  const fecha = new Date(
    Date.UTC(fechaApi.getUTCFullYear(), fechaApi.getUTCMonth(), fechaApi.getUTCDate()),
  );

  const fuente = typeof payload.source === 'string' ? payload.source : null;

  // Keep full precision: never round nor use toFixed; Prisma handles the scale.
  return { apiId, fecha, usd: String(usdNumber), fuente, fechaApi };
}
