import { z } from 'zod';

const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD');

const estadoPago = z.enum(['pendiente', 'validado', 'rechazado', 'duplicado']);

const filtros = {
  fechaDesde: fechaISO.optional(),
  fechaHasta: fechaISO.optional(),
  // Date range for the LINKED bank movement's execution date (`fechaEjecucion`).
  fechaMovimientoDesde: fechaISO.optional(),
  fechaMovimientoHasta: fechaISO.optional(),
  cobradorId: z.coerce.number().int().positive().optional(),
  bancoId: z.coerce.number().int().positive().optional(),
  estado: estadoPago.optional(),
};

export const reporteQuerySchema = z.object({
  ...filtros,
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

export const exportQuerySchema = z.object({
  ...filtros,
  formato: z.enum(['excel', 'pdf']).default('excel'),
});

export const tipoReporteParamSchema = z.object({
  tipo: z.enum([
    'cobros',
    'por-cobrador',
    'nuevo-viejo',
    'tasas',
    'pendientes',
    'movimientos-no-conciliados',
    'pagos-sin-respaldo',
    'flujo-caja',
    'gastos',
  ]),
});

export type ReporteQuery = z.infer<typeof reporteQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
export type TipoReporte = z.infer<typeof tipoReporteParamSchema>['tipo'];
export type EstadoPagoFiltro = z.infer<typeof estadoPago>;
