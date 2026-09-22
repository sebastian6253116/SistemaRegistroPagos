import { Badge } from '@/components/ui/badge';
import type { EstadoPago, PagoReportado, TipoCobro } from '@/types';

const ESTADOS: Record<EstadoPago, { label: string; variant: 'default' | 'success' | 'destructive' | 'warning' | 'secondary' }> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  validado: { label: 'Validado', variant: 'success' },
  rechazado: { label: 'Rechazado', variant: 'destructive' },
  duplicado: { label: 'Duplicado', variant: 'secondary' },
};

export function EstadoBadge({ estado }: { estado: EstadoPago }) {
  const conf = ESTADOS[estado] ?? { label: estado, variant: 'secondary' as const };
  return <Badge variant={conf.variant}>{conf.label}</Badge>;
}

export function TipoCobroBadge({ tipo }: { tipo: TipoCobro | null }) {
  if (!tipo) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={tipo === 'nuevo' ? 'default' : 'outline'}>{tipo === 'nuevo' ? 'Nuevo' : 'Viejo'}</Badge>;
}

/**
 * Signed whole-day gap between the collector-reported date and the LINKED bank
 * movement's execution date, or `null` when the payment has no movement-derived
 * verdict. The API computes and persists this (`antiguedadDias`) at validation
 * time and is the single source of truth, so the client does not re-derive the
 * date arithmetic.
 */
export function antiguedadMovimiento(pago: PagoReportado): number | null {
  return pago.antiguedadDias ?? null;
}

/**
 * Movement-derived vintage verdict, read from the PERSISTED fields
 * (`fuenteDerivacion` + `tipoCobroDerivado`). A payment with no linked movement
 * (e.g. still pending) shows `—`. The badge is the same one used across the app,
 * so the verdict keeps ONE consistent visual.
 */
export function AntiguedadVeredicto({ pago }: { pago: PagoReportado }) {
  const dias = antiguedadMovimiento(pago);
  if (dias === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <TipoCobroBadge tipo={pago.tipoCobroDerivado} />
      <span className="text-xs tabular-nums text-muted-foreground">
        {dias === 0 ? 'Del día' : `${dias} día(s)`}
      </span>
    </span>
  );
}

/** Short Spanish verdict line used by the validation confirmation toast. */
export function descripcionVeredicto(pago: PagoReportado): string {
  const dias = antiguedadMovimiento(pago);
  if (dias === null || !pago.tipoCobroDerivado) {
    return 'El movimiento bancario quedó conciliado.';
  }
  if (dias === 0) return 'Del día';
  const tipo = pago.tipoCobroDerivado === 'viejo' ? 'Viejo' : 'Nuevo';
  return `${tipo} (${dias} día${dias === 1 ? '' : 's'})`;
}
