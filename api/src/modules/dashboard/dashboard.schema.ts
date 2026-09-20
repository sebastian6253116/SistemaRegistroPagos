import { z } from 'zod';

const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD');

export const resumenQuerySchema = z.object({
  fecha: fechaISO.optional(),
});

export const serieQuerySchema = z.object({
  dias: z.coerce.number().int().min(1).max(365).default(30),
});

export const nuevoViejoQuerySchema = z.object({
  desde: fechaISO.optional(),
  hasta: fechaISO.optional(),
});

export type ResumenQuery = z.infer<typeof resumenQuerySchema>;
export type SerieQuery = z.infer<typeof serieQuerySchema>;
export type NuevoViejoQuery = z.infer<typeof nuevoViejoQuerySchema>;
