import { z } from 'zod';

export const previewQuerySchema = z.object({
  cuentaRecaudadoraId: z.coerce.number().int().positive(),
  primeraFilaEsEncabezado: z.enum(['true', 'false']).optional(),
});

export const importarBodySchema = z.object({
  cuentaRecaudadoraId: z.coerce.number().int().positive(),
  primeraFilaEsEncabezado: z.enum(['true', 'false']).optional(),
});

export const listarLotesSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type ImportarBody = z.infer<typeof importarBodySchema>;
