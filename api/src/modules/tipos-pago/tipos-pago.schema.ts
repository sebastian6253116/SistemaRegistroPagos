import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

const optionalSearch = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1, 'El termino de busqueda es invalido').max(120).optional(),
);

const optionalActivo = z.preprocess(
  emptyToUndefined,
  z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
);

export const listTiposPagoQuerySchema = z.object({
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
  search: optionalSearch,
  activo: optionalActivo,
});

export const tipoPagoIdParamSchema = z.object({
  id: z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo'),
});

export const createTipoPagoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(80, 'El nombre no puede superar 80 caracteres'),
  descripcion: z
    .string()
    .trim()
    .max(255, 'La descripcion no puede superar 255 caracteres')
    .nullable()
    .optional(),
  activo: z.boolean().optional(),
  orden: z.coerce
    .number()
    .int('El orden debe ser entero')
    .min(0, 'El orden no puede ser negativo')
    .optional(),
});

export const updateTipoPagoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(80, 'El nombre no puede superar 80 caracteres')
    .optional(),
  descripcion: z
    .string()
    .trim()
    .max(255, 'La descripcion no puede superar 255 caracteres')
    .nullable()
    .optional(),
  activo: z.boolean().optional(),
  orden: z.coerce
    .number()
    .int('El orden debe ser entero')
    .min(0, 'El orden no puede ser negativo')
    .optional(),
});

export type ListTiposPagoQuery = z.infer<typeof listTiposPagoQuerySchema>;
export type CreateTipoPagoInput = z.infer<typeof createTipoPagoSchema>;
export type UpdateTipoPagoInput = z.infer<typeof updateTipoPagoSchema>;
