import { z } from 'zod';

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

const optionalBoolean = z.preprocess(
  emptyToUndefined,
  z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
);

export const listarNotificacionesSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  soloNoLeidas: optionalBoolean,
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type ListarNotificacionesQuery = z.infer<typeof listarNotificacionesSchema>;

/** Internal payload used by the notification triggers. */
export interface CrearNotificacionInput {
  tipo: string;
  titulo: string;
  mensaje: string;
  entidad?: string | null;
  entidadId?: number | null;
}
