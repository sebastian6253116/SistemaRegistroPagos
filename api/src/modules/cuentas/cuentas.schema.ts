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

const optionalBancoId = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int('El banco debe ser entero').positive('El banco debe ser positivo').optional(),
);

export const listCuentasQuerySchema = z.object({
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
  bancoId: optionalBancoId,
  activo: optionalActivo,
});

export const cuentaIdParamSchema = z.object({
  id: z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo'),
});

export const createCuentaSchema = z.object({
  bancoId: z.coerce.number().int('El banco debe ser entero').positive('El banco es obligatorio'),
  numeroCuenta: z
    .string()
    .trim()
    .min(1, 'El numero de cuenta es obligatorio')
    .max(40, 'El numero de cuenta no puede superar 40 caracteres'),
  alias: z
    .string()
    .trim()
    .max(120, 'El alias no puede superar 120 caracteres')
    .nullable()
    .optional(),
  activo: z.boolean().optional(),
});

export const updateCuentaSchema = z.object({
  bancoId: z.coerce.number().int('El banco debe ser entero').positive('El banco es obligatorio').optional(),
  numeroCuenta: z
    .string()
    .trim()
    .min(1, 'El numero de cuenta es obligatorio')
    .max(40, 'El numero de cuenta no puede superar 40 caracteres')
    .optional(),
  alias: z
    .string()
    .trim()
    .max(120, 'El alias no puede superar 120 caracteres')
    .nullable()
    .optional(),
  activo: z.boolean().optional(),
});

export type ListCuentasQuery = z.infer<typeof listCuentasQuerySchema>;
export type CreateCuentaInput = z.infer<typeof createCuentaSchema>;
export type UpdateCuentaInput = z.infer<typeof updateCuentaSchema>;
