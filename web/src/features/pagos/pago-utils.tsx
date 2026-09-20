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
