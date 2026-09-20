import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

const optionalSearch = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1, 'El termino de busqueda es invalido').max(100).optional(),
);

export const listParametrosQuerySchema = z.object({
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

export const parametroClaveParamSchema = z.object({
  clave: z
    .string()
    .trim()
    .min(1, 'La clave es obligatoria')
    .max(100, 'La clave no puede superar 100 caracteres'),
});

export const updateParametroSchema = z.object({
  valor: z
    .string()
    .trim()
    .min(1, 'El valor es obligatorio')
    .max(255, 'El valor no puede superar 255 caracteres'),
  descripcion: z
    .string()
    .trim()
    .max(255, 'La descripcion no puede superar 255 caracteres')
    .nullable()
    .optional(),
});

export const bulkParametrosSchema = z.object({
  parametros: z
    .array(
      z.object({
        clave: z
          .string()
          .trim()
          .min(1, 'La clave es obligatoria')
          .max(100, 'La clave no puede superar 100 caracteres'),
        valor: z
          .string()
          .trim()
          .min(1, 'El valor es obligatorio')
          .max(255, 'El valor no puede superar 255 caracteres'),
      }),
    )
    .min(1, 'Debe enviar al menos un parametro'),
});

export type ListParametrosQuery = z.infer<typeof listParametrosQuerySchema>;
export type UpdateParametroInput = z.infer<typeof updateParametroSchema>;
export type BulkParametrosInput = z.infer<typeof bulkParametrosSchema>;
