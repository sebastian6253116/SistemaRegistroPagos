import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

const optionalSearch = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1, 'El termino de busqueda es invalido').max(120).optional(),
);

const optionalUsuarioId = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .int('El usuario debe ser entero')
    .positive('El usuario debe ser positivo')
    .optional(),
);

/** Normalizes a filter date (YYYY-MM-DD or ISO) to UTC midnight. */
const optionalFecha = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .min(1, 'La fecha es invalida')
    .transform((value) => {
      const iso = value.length === 10 ? `${value}T00:00:00.000Z` : value;
      const date = new Date(iso);
      date.setUTCHours(0, 0, 0, 0);
      return date;
    })
    .refine((date) => !Number.isNaN(date.getTime()), 'La fecha es invalida')
    .optional(),
);

export const listAuditoriaQuerySchema = z.object({
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
  usuarioId: optionalUsuarioId,
  entidad: optionalSearch,
  accion: optionalSearch,
  fechaDesde: optionalFecha,
  fechaHasta: optionalFecha,
});

export type ListAuditoriaQuery = z.infer<typeof listAuditoriaQuerySchema>;
