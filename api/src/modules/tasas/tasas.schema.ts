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

const valorField = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,6})?$/, 'El valor debe ser un decimal con hasta 6 decimales');

const fuenteField = z
  .string()
  .trim()
  .max(120, 'La fuente no puede superar 120 caracteres')
  .nullable()
  .optional();

const optionalFecha = z.preprocess(emptyToUndefined, fechaField.optional());

export const listTasasQuerySchema = z.object({
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

export const tasaIdParamSchema = z.object({
  id: z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo'),
});

export const createTasaSchema = z.object({
  fecha: fechaField,
  valor: valorField,
  fuente: fuenteField,
});

export const updateTasaSchema = z.object({
  fecha: fechaField.optional(),
  valor: valorField.optional(),
  fuente: fuenteField,
});

export type ListTasasQuery = z.infer<typeof listTasasQuerySchema>;
export type CreateTasaInput = z.infer<typeof createTasaSchema>;
export type UpdateTasaInput = z.infer<typeof updateTasaSchema>;
