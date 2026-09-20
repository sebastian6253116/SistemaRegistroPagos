import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

/** Normalizes a date input (YYYY-MM-DD or ISO) to UTC midnight (day granularity). */
const fechaField = z
  .string()
  .trim()
  .min(1, 'La fecha es obligatoria')
  .transform((value) => {
    const iso = value.length === 10 ? `${value}T00:00:00.000Z` : value;
    const date = new Date(iso);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  })
  .refine((date) => !Number.isNaN(date.getTime()), 'La fecha es invalida');

const optionalFecha = z.preprocess(emptyToUndefined, fechaField.optional());

export const historialBcvQuerySchema = z.object({
  page: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int('La pagina debe ser entera').positive('La pagina debe ser positiva').optional(),
  ),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int('El tamano de pagina debe ser entero')
      .positive('El tamano de pagina debe ser positivo')
      .max(200, 'El tamano de pagina no puede superar 200')
      .optional(),
  ),
  fechaDesde: optionalFecha,
  fechaHasta: optionalFecha,
});

export const jobConfigSchema = z.object({
  habilitado: z.boolean({
    required_error: 'El campo habilitado es obligatorio',
    invalid_type_error: 'El campo habilitado debe ser booleano',
  }),
});

export type HistorialBcvQuery = z.infer<typeof historialBcvQuerySchema>;
export type JobConfigInput = z.infer<typeof jobConfigSchema>;
