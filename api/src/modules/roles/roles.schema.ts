import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

const optionalSearch = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1, 'El termino de busqueda es invalido').max(80).optional(),
);

export const listRolesQuerySchema = z.object({
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
});

export const rolIdParamSchema = z.object({
  id: z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo'),
});

export const createRolSchema = z.object({
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
  permisos: z.array(z.string().trim().min(1, 'La clave de permiso es invalida')).default([]),
});

export const updateRolSchema = z.object({
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
  permisos: z.array(z.string().trim().min(1, 'La clave de permiso es invalida')).optional(),
});

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
export type CreateRolInput = z.infer<typeof createRolSchema>;
export type UpdateRolInput = z.infer<typeof updateRolSchema>;
