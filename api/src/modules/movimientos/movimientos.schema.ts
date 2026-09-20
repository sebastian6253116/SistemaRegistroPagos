import { z } from 'zod';

export const listarMovimientosSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  fechaDesde: z.coerce.date().optional(),
  fechaHasta: z.coerce.date().optional(),
  cuentaRecaudadoraId: z.coerce.number().int().positive().optional(),
  loteImportacionId: z.coerce.number().int().positive().optional(),
  estadoConciliacion: z.enum(['no_conciliado', 'conciliado']).optional(),
  referencia: z.string().max(60).optional(),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type ListarMovimientosQuery = z.infer<typeof listarMovimientosSchema>;
