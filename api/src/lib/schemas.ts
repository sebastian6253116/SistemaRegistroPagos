import { z } from 'zod';

/**
 * Shared validator for a positive monetary amount (DECIMAL(18,2) columns).
 *
 * Accepts a string or a number but MUST resolve to a finite, strictly positive
 * decimal: non-numeric strings, negatives and zero are rejected at the schema
 * layer, so the caller gets a 400 instead of the opaque 500 a downstream
 * `calcularTasa()` failure would produce.
 */
export const montoPositivo = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine(
    (v) => /^\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v)) && Number(v) > 0,
    'El monto debe ser un numero positivo',
  )
  // Normalise to the DECIMAL(18,2) scale BEFORE the value reaches the service.
  // The money columns store 2 decimals, so an unrounded input would be persisted
  // rounded while `calcularTasa` spread the unrounded value, leaving the stored
  // `tasa` inconsistent with the stored amounts.
  .transform((v) => Number(v).toFixed(2))
  // Rounding a sub-cent amount yields "0.00", which is no longer positive.
  .refine((v) => Number(v) > 0, 'El monto debe ser un numero positivo');
