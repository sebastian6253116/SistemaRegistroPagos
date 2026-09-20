import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

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

const optionalId = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo').optional(),
);

export const listUsuariosQuerySchema = z.object({
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
  rolId: optionalId,
  activo: optionalActivo,
});

export const usuarioIdParamSchema = z.object({
  id: z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo'),
});

export const createUsuarioSchema = z.object({
  nombreCompleto: z
    .string()
    .trim()
    .min(1, 'El nombre completo es obligatorio')
    .max(150, 'El nombre completo no puede superar 150 caracteres'),
  usuario: z
    .string()
    .trim()
    .min(1, 'El usuario es obligatorio')
    .max(60, 'El usuario no puede superar 60 caracteres'),
  email: z.string().trim().email('Email invalido').max(150, 'El email no puede superar 150 caracteres'),
  password: z
    .string()
    .min(8, 'La contrasena debe tener al menos 8 caracteres')
    .max(200, 'La contrasena no puede superar 200 caracteres'),
  rolId: z.coerce.number().int('El rol debe ser entero').positive('El rol es obligatorio'),
  activo: z.boolean().optional(),
});

export const updateUsuarioSchema = z.object({
  nombreCompleto: z
    .string()
    .trim()
    .min(1, 'El nombre completo es obligatorio')
    .max(150, 'El nombre completo no puede superar 150 caracteres')
    .optional(),
  usuario: z
    .string()
    .trim()
    .min(1, 'El usuario es obligatorio')
    .max(60, 'El usuario no puede superar 60 caracteres')
    .optional(),
  email: z
    .string()
    .trim()
    .email('Email invalido')
    .max(150, 'El email no puede superar 150 caracteres')
    .optional(),
  password: z
    .string()
    .min(8, 'La contrasena debe tener al menos 8 caracteres')
    .max(200, 'La contrasena no puede superar 200 caracteres')
    .optional(),
  rolId: z.coerce.number().int('El rol debe ser entero').positive('El rol es obligatorio').optional(),
  activo: z.boolean().optional(),
});

export type ListUsuariosQuery = z.infer<typeof listUsuariosQuerySchema>;
export type CreateUsuarioInput = z.infer<typeof createUsuarioSchema>;
export type UpdateUsuarioInput = z.infer<typeof updateUsuarioSchema>;
