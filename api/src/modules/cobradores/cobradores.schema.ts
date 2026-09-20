import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

const emptyStringToUndefined = (v: unknown) => (v === '' ? undefined : v);

const optionalSearch = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1, 'El termino de busqueda es invalido').max(150).optional(),
);

const optionalActivo = z.preprocess(
  emptyToUndefined,
  z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
);

const optionalUsuarioId = z.preprocess(
  emptyStringToUndefined,
  z.coerce
    .number()
    .int('El usuario debe ser entero')
    .positive('El usuario debe ser positivo')
    .nullable()
    .optional(),
);

export const listCobradoresQuerySchema = z.object({
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

export const cobradorIdParamSchema = z.object({
  id: z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo'),
});

export const createCobradorSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(150, 'El nombre no puede superar 150 caracteres'),
  codigo: z
    .string()
    .trim()
    .min(1, 'El codigo es obligatorio')
    .max(40, 'El codigo no puede superar 40 caracteres'),
  usuarioId: optionalUsuarioId,
  activo: z.boolean().optional(),
});

export const updateCobradorSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(150, 'El nombre no puede superar 150 caracteres')
    .optional(),
  codigo: z
    .string()
    .trim()
    .min(1, 'El codigo es obligatorio')
    .max(40, 'El codigo no puede superar 40 caracteres')
    .optional(),
  usuarioId: optionalUsuarioId,
  activo: z.boolean().optional(),
});

export type ListCobradoresQuery = z.infer<typeof listCobradoresQuerySchema>;
export type CreateCobradorInput = z.infer<typeof createCobradorSchema>;
export type UpdateCobradorInput = z.infer<typeof updateCobradorSchema>;
