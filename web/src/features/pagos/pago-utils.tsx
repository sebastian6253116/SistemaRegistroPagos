import { Badge } from '@/components/ui/badge';
import type { EstadoPago, TipoCobro } from '@/types';

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
 * Alerta de "documento viejo": el pago se reportó con fecha antigua pero el
 * banco ejecutó el movimiento mucho después. Solo se renderiza cuando la API
 * marca un desfase (`dias` distinto de null).
 */
export function AlertaAntiguedadBadge({ dias }: { dias: number | null }) {
  if (dias == null) return null;
  return (
    <Badge
      variant="warning"
      title={`El pago se registró ${dias} día(s) antes de la fecha de ejecución del movimiento bancario.`}
    >
      Documento viejo · {dias} d
    </Badge>
  );
}
