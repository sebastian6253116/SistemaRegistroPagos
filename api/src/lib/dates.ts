/**
 * Business calendar-date helpers.
 *
 * `fecha_pago`, `fecha_ejecucion` and the other business dates are MySQL DATE
 * columns (no time): they are stored and compared as plain calendar dates and
 * are NEVER shifted by a timezone offset. The only place the business timezone
 * (America/Caracas) matters is deciding which calendar day "today" is.
 */
const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC-4, no DST

/** Business "today" (America/Caracas) as a YYYY-MM-DD string. */
export function hoyCaracas(): string {
  return new Date(Date.now() - CARACAS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Adds days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * True when a DATE-column value is STRICTLY after the business "today"
 * (America/Caracas). A DATE is read at UTC midnight, so its calendar day is the
 * UTC date part; comparing YYYY-MM-DD strings never shifts the day.
 */
export function esFechaFutura(fecha: Date): boolean {
  return fecha.toISOString().slice(0, 10) > hoyCaracas();
}
