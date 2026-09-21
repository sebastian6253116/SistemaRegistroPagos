import { z } from 'zod';
import { montoPositivo } from '../../lib/schemas';

const fecha = z
  .string()
  .min(1, 'La fecha es obligatoria')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha invalida');

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listarGastosQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  fechaDesde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD')
    .optional(),
  fechaHasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD')
    .optional(),
  categoria: z.string().max(100).optional(),
  autorizadoPor: z.string().max(180).optional(),
  registradoPor: z.coerce.number().int().positive().optional(),
});

export const crearGastoSchema = z.object({
  fecha,
  montoBs: montoPositivo,
  montoUsd: montoPositivo,
  movimientoBancoId: z.coerce.number().int().positive().optional(),
  referencia: z.string().max(60).optional(),
  descripcion: z.string().min(1, 'La descripcion es obligatoria').max(500),
  categoria: z.string().min(1, 'La categoria es obligatoria').max(100),
  autorizadoPor: z
    .string()
    .min(1, 'Debe indicar quien autorizo el gasto')
    .max(180),
});

export const actualizarGastoSchema = crearGastoSchema.partial();

export type ListarGastosQuery = z.infer<typeof listarGastosQuerySchema>;
export type CrearGastoInput = z.infer<typeof crearGastoSchema>;
export type ActualizarGastoInput = z.infer<typeof actualizarGastoSchema>;
