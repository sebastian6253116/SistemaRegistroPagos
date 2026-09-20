import { z } from 'zod';
import { TipoCobro } from '@prisma/client';

// Monetary amount shared by every payment amount field (montoBs / montoUsd).
// Accepts a string or a number but MUST resolve to a finite, strictly positive
// decimal. Validating here returns a 400; without it, a non-numeric/zero/negative
// value reached `calcularTasa()` (a pure lib that throws a plain Error) and
// surfaced as an opaque 500.
const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine(
    (v) => /^\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v)) && Number(v) > 0,
    'El monto debe ser un numero positivo',
  );

export const reportarPagoSchema = z.object({
  fechaPago: z.coerce.date({ errorMap: () => ({ message: 'Fecha de pago invalida' }) }),
  // Optional document/debt date used to derive the vintage classification.
  fechaDocumento: z.coerce.date().optional(),
  referencia: z.string().min(1, 'La referencia es obligatoria').max(60),
  bancoOrigenId: z.coerce.number().int().positive('Banco de origen invalido').optional().nullable(),
  cuentaRecaudadoraId: z.coerce.number().int().positive('Cuenta recaudadora invalida'),
  montoBs: decimalString,
  montoUsd: decimalString,
  cliente: z.string().max(180).optional(),
  concepto: z.string().max(255).optional(),
  tipoCobro: z.nativeEnum(TipoCobro),
  // Optional payment-method catalog reference (tipos_pago).
  tipoPagoId: z.coerce.number().int().positive().optional(),
  observaciones: z.string().max(2000).optional(),
  // Admins/administrativos may report on behalf of a collector.
  cobradorId: z.coerce.number().int().positive().optional(),
});

export const listarPagosSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  fechaDesde: z.coerce.date().optional(),
  fechaHasta: z.coerce.date().optional(),
  cobradorId: z.coerce.number().int().positive().optional(),
  bancoOrigenId: z.coerce.number().int().positive().optional(),
  cuentaRecaudadoraId: z.coerce.number().int().positive().optional(),
  estado: z.enum(['pendiente', 'validado', 'rechazado', 'duplicado']).optional(),
  tipoCobro: z.nativeEnum(TipoCobro).optional(),
  tipoPagoId: z.coerce.number().int().positive().optional(),
  referencia: z.string().max(60).optional(),
  montoMin: z.coerce.number().nonnegative().optional(),
  montoMax: z.coerce.number().nonnegative().optional(),
  soloRevisar: z.enum(['true', 'false']).optional(),
});

export const editarPagoSchema = z.object({
  referencia: z.string().min(1).max(60).optional(),
  bancoOrigenId: z.coerce.number().int().positive().optional().nullable(),
  cuentaRecaudadoraId: z.coerce.number().int().positive().optional(),
  montoBs: decimalString.optional(),
  montoUsd: decimalString.optional(),
  fechaPago: z.coerce.date().optional(),
  cliente: z.string().max(180).optional(),
  concepto: z.string().max(255).optional(),
  tipoCobro: z.nativeEnum(TipoCobro).optional(),
  tipoPagoId: z.coerce.number().int().positive().optional(),
  observaciones: z.string().max(2000).optional(),
});

export const validarPagoSchema = z.object({
  movimientoBancoId: z.coerce.number().int().positive().optional(),
});

export const rechazarPagoSchema = z.object({
  motivoRechazo: z
    .string()
    .min(3, 'El motivo de rechazo es obligatorio (minimo 3 caracteres)')
    .max(1000),
});

export const revertirPagoSchema = z
  .object({
    estado: z.enum(['pendiente', 'rechazado'], {
      errorMap: () => ({ message: 'El estado destino debe ser "pendiente" o "rechazado"' }),
    }),
    motivoRechazo: z
      .string()
      .min(3, 'El motivo de rechazo es obligatorio (minimo 3 caracteres)')
      .max(1000)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.estado === 'rechazado' && !data.motivoRechazo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El motivo de rechazo es obligatorio (minimo 3 caracteres)',
        path: ['motivoRechazo'],
      });
    }
  });

export const validarLoteSchema = z.object({
  items: z
    .array(
      z.object({
        pagoReportadoId: z.coerce.number().int().positive(),
        movimientoBancoId: z.coerce.number().int().positive(),
      }),
    )
    .min(1, 'Debe enviar al menos un pago'),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type ReportarPagoInput = z.infer<typeof reportarPagoSchema>;
export type ListarPagosQuery = z.infer<typeof listarPagosSchema>;
export type EditarPagoInput = z.infer<typeof editarPagoSchema>;
export type RevertirPagoInput = z.infer<typeof revertirPagoSchema>;
