import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

const optionalSearch = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1, 'El termino de busqueda es invalido').max(120).optional(),
);

export const listBancosQuerySchema = z.object({
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

export const bancoIdParamSchema = z.object({
  id: z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo'),
});

export const createBancoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(120, 'El nombre no puede superar 120 caracteres'),
  codigo: z
    .string()
    .trim()
    .min(1, 'El codigo es obligatorio')
    .max(20, 'El codigo no puede superar 20 caracteres'),
});

export const updateBancoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(120, 'El nombre no puede superar 120 caracteres')
    .optional(),
  codigo: z
    .string()
    .trim()
    .min(1, 'El codigo es obligatorio')
    .max(20, 'El codigo no puede superar 20 caracteres')
    .optional(),
});

export type ListBancosQuery = z.infer<typeof listBancosQuerySchema>;
export type CreateBancoInput = z.infer<typeof createBancoSchema>;
export type UpdateBancoInput = z.infer<typeof updateBancoSchema>;
