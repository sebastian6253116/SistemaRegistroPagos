import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Clock,
  Hash,
  Landmark,
  TrendingUp,
} from 'lucide-react';
import { getNuevoViejo, getResumen, getSerie } from '@/api/dashboard';
import { queryKeys, STALE_LISTS } from '@/lib/queryClient';
import { formatAntiguedad, formatDate, formatMoney, formatNumber, formatRate, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">Sin base de comparación</span>;
  const positive = value >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        positive ? 'text-success' : 'text-destructive',
      )}
    >
      {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {value.toFixed(1)} %
    </span>
  );
}

function StatCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string;
  hint?: ReactNode;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4 pt-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 truncate text-2xl font-semibold">{value}</p>
          {hint && <div className="mt-1">{hint}</div>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const resumen = useQuery({
    queryKey: queryKeys.dashboardResumen(),
    queryFn: () => getResumen(),
    staleTime: STALE_LISTS,
  });
  const serie = useQuery({
    queryKey: queryKeys.dashboardSerie(30),
    queryFn: () => getSerie(30),
    staleTime: STALE_LISTS,
  });
  const nuevoViejo = useQuery({
    queryKey: queryKeys.dashboardNuevoViejo(),
    queryFn: () => getNuevoViejo(),
    staleTime: STALE_LISTS,
  });

  if (resumen.isLoading) return <LoadingState label="Cargando dashboard…" />;
  if (resumen.isError) return <ErrorState error={resumen.error} onRetry={() => resumen.refetch()} />;
  const r = resumen.data!;

  const distData = nuevoViejo.data
    ? [
        { name: 'Nuevo', value: toNumber(nuevoViejo.data.nuevo.totalUsd) },
        { name: 'Viejo', value: toNumber(nuevoViejo.data.viejo.totalUsd) },
      ]
    : [];
  const colors = ['hsl(var(--primary))', 'hsl(var(--warning))'];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Resumen operativo del día ${formatDate(r.fecha)}. Montos expresados en USD.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Cobros del día (USD)"
          value={formatMoney(r.cobrosDelDia.totalUsd)}
          hint={
            <span className="flex flex-wrap items-center gap-2">
              <Trend value={r.comparativo.vsDiaAnterior.variacionPct} />
              <span className="text-xs text-muted-foreground">vs. día anterior</span>
            </span>
          }
          icon={<CircleDollarSign className="h-5 w-5" />}
        />
        <StatCard
          title="Cobros del día (Bs)"
          value={formatMoney(r.cobrosDelDia.totalBs)}
          hint={
            <span className="flex items-center gap-2">
              <Trend value={r.comparativo.vsPromedio7Dias.variacionPct} />
              <span className="text-xs text-muted-foreground">vs. promedio 7 días</span>
            </span>
          }
          icon={<Landmark className="h-5 w-5" />}
        />
        <StatCard
          title="Cantidad de pagos"
          value={formatNumber(r.cobrosDelDia.cantidad)}
          hint={
            <span className="text-xs text-muted-foreground">
              Tasa promedio ponderada: {formatRate(r.cobrosDelDia.tasaPromedioPonderada)} Bs/USD
            </span>
          }
          icon={<Hash className="h-5 w-5" />}
        />
        <StatCard
          title="Pendientes por validar"
          value={formatNumber(r.pendientes.cantidad)}
          hint={
            <span className="text-xs text-muted-foreground">
              {formatMoney(r.pendientes.montoUsd)} USD · máx. {formatAntiguedad(r.pendientes.antiguedadMaxHoras)}
            </span>
          }
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Cobros validados — últimos 30 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            {serie.isLoading ? (
              <div className="h-72 animate-pulse rounded-md bg-muted" />
            ) : serie.data && serie.data.data.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie.data.data} margin={{ left: 4, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="usdFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="fecha"
                      tickFormatter={(v) => String(v).slice(5)}
                      fontSize={11}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      fontSize={11}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v) => formatNumber(Number(v))}
                      width={70}
                    />
                    <Tooltip
                      formatter={(value) => [formatMoney(value as string | number), 'USD']}
                      labelFormatter={(label) => `Fecha: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="totalUsd"
                      stroke="hsl(var(--primary))"
                      fill="url(#usdFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="Sin cobros validados" description="No hay datos en los últimos 30 días." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              Distribución nuevo vs. viejo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nuevoViejo.isLoading ? (
              <div className="h-72 animate-pulse rounded-md bg-muted" />
            ) : distData.some((d) => d.value > 0) ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                    >
                      {distData.map((_, index) => (
                        <Cell key={index} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip formatter={(value) => formatMoney(value as string | number)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="Sin datos" description="No hay cobros clasificados en el período." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ranking de cobradores del día</CardTitle>
          </CardHeader>
          <CardContent>
            {r.rankingCobradores.length === 0 ? (
              <EmptyState title="Sin cobros hoy" description="Aún no hay pagos validados el día de hoy." />
            ) : (
              <ul className="divide-y">
                {r.rankingCobradores.map((c, index) => (
                  <li key={c.cobradorId} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{c.nombre}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(c.cantidad)} pagos</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold">{formatMoney(c.totalUsd)} USD</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Movimientos bancarios sin conciliar</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-amber-600 dark:text-amber-400">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{formatNumber(r.movimientosSinConciliar.cantidad)}</p>
              <p className="text-sm text-muted-foreground">
                {formatMoney(r.movimientosSinConciliar.montoBs)} Bs sin respaldo reportado
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
