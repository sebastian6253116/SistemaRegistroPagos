import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { exportarReporte, reportesApi, type ReporteFiltros } from '@/api/reportes';
import { listarCobradores } from '@/api/cobradores';
import { getCatalogoFormPago } from '@/api/pagos';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_CATALOGS, STALE_LISTS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { formatAntiguedad, formatDate, formatMoney, formatNumber, formatPercent, formatRate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { EstadoBadge } from '@/features/pagos/pago-utils';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import type { Paginated, TipoReporte } from '@/types';

const REPORT_PAGE_SIZE = 50;

/**
 * Builds the `pagination` prop for a report table from the server `meta`, so the
 * user can reach every page instead of only the first window.
 */
function paginacionReporte(
  meta: Paginated<unknown>['meta'] | undefined,
  onPageChange: (page: number) => void,
) {
  if (!meta) return undefined;
  return {
    page: meta.page,
    pageSize: meta.pageSize,
    total: meta.total,
    totalPages: meta.totalPages,
    onPageChange,
  };
}

type ReportTabProps = {
  filtros: ReporteFiltros;
  onPageChange: (page: number) => void;
};

const REPORTES: { tipo: TipoReporte; label: string }[] = [
  { tipo: 'cobros', label: 'Cobros por período' },
  { tipo: 'por-cobrador', label: 'Por cobrador' },
  { tipo: 'nuevo-viejo', label: 'Nuevo vs viejo' },
  { tipo: 'tasas', label: 'Análisis de tasa' },
  { tipo: 'pendientes', label: 'Pendientes' },
  { tipo: 'movimientos-no-conciliados', label: 'No conciliados' },
  { tipo: 'pagos-sin-respaldo', label: 'Sin respaldo' },
  { tipo: 'flujo-caja', label: 'Flujo de caja' },
  { tipo: 'gastos', label: 'Gastos' },
];

function ExportButtons({ tipo, filtros }: { tipo: TipoReporte; filtros: ReporteFiltros }) {
  const { tiene } = usePermiso();
  const toast = useToast();
  const [loading, setLoading] = useState<'excel' | 'pdf' | null>(null);
  if (!tiene('reportes.exportar')) return null;

  async function exportar(formato: 'excel' | 'pdf') {
    setLoading(formato);
    try {
      await exportarReporte(tipo, formato, filtros);
    } catch (error) {
      toast.error('No se pudo exportar', getApiErrorMessage(error));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" loading={loading === 'excel'} onClick={() => exportar('excel')}>
        <FileSpreadsheet className="h-4 w-4" />
        Excel
      </Button>
      <Button variant="outline" size="sm" loading={loading === 'pdf'} onClick={() => exportar('pdf')}>
        <FileDown className="h-4 w-4" />
        PDF
      </Button>
    </div>
  );
}

function ResumenCard({ items }: { items: { label: string; value: string }[] }) {
  return (
    <Card className="mb-4">
      <CardContent className="grid grid-cols-2 gap-3 p-4 pt-4 sm:grid-cols-4">
        {items.map((i) => (
          <div key={i.label}>
            <p className="text-xs text-muted-foreground">{i.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{i.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TablaWrapper({
  children,
  filtros,
  tipo,
}: {
  children: ReactNode;
  filtros: ReporteFiltros;
  tipo: TipoReporte;
}) {
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <ExportButtons tipo={tipo} filtros={filtros} />
      </div>
      {children}
    </div>
  );
}

function CobrosTab({ filtros, onPageChange }: ReportTabProps) {
  const q = useQuery({
    queryKey: queryKeys.reporte('cobros', filtros),
    queryFn: () => reportesApi.cobros(filtros),
    staleTime: STALE_LISTS,
  });
  const columns = useMemo<ColumnDef<NonNullable<typeof q.data>['data'][number], unknown>[]>(
    () => [
      { accessorKey: 'fechaPago', header: 'Fecha', cell: ({ row }) => formatDate(row.original.fechaPago) },
      { accessorKey: 'referencia', header: 'Referencia' },
      { id: 'cobrador', header: 'Cobrador', cell: ({ row }) => row.original.cobrador.nombre },
      { id: 'banco', header: 'Banco', cell: ({ row }) => row.original.cuentaRecaudadora.banco.nombre },
      { accessorKey: 'montoBs', header: 'Monto Bs', cell: ({ row }) => formatMoney(row.original.montoBs) },
      { accessorKey: 'montoUsd', header: 'Monto USD', cell: ({ row }) => formatMoney(row.original.montoUsd) },
      { accessorKey: 'tasa', header: 'Tasa', cell: ({ row }) => formatRate(row.original.tasa) },
      { accessorKey: 'estado', header: 'Estado' },
    ],
    [],
  );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TablaWrapper filtros={filtros} tipo="cobros">
      {q.data && (
        <ResumenCard
          items={[
            { label: 'Total USD', value: formatMoney(q.data.consolidado.totalUsd) },
            { label: 'Total Bs', value: formatMoney(q.data.consolidado.totalBs) },
            { label: 'Cantidad', value: formatNumber(q.data.consolidado.cantidad) },
          ]}
        />
      )}
      <DataTable
        columns={columns}
        data={q.data?.data ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => String(r.id)}
        mobileCard={(row) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.referencia}</p>
                <p className="text-xs text-muted-foreground">{formatDate(row.fechaPago)}</p>
              </div>
              <EstadoBadge estado={row.estado} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div className="col-span-2">
                <dt className="text-muted-foreground">Cobrador</dt>
                <dd className="truncate">{row.cobrador.nombre}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Banco</dt>
                <dd className="truncate">{row.cuentaRecaudadora.banco.nombre}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto USD</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.montoUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto Bs</dt>
                <dd className="tabular-nums">{formatMoney(row.montoBs)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tasa</dt>
                <dd className="tabular-nums text-muted-foreground">{formatRate(row.tasa)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin cobros en el período"
        pagination={paginacionReporte(q.data?.meta, onPageChange)}
      />
    </TablaWrapper>
  );
}

function PorCobradorTab({ filtros, onPageChange }: ReportTabProps) {
  const q = useQuery({
    queryKey: queryKeys.reporte('por-cobrador', filtros),
    queryFn: () => reportesApi.porCobrador(filtros),
    staleTime: STALE_LISTS,
  });
  const columns = useMemo<ColumnDef<NonNullable<typeof q.data>['data'][number], unknown>[]>(
    () => [
      { accessorKey: 'cobrador', header: 'Cobrador' },
      { accessorKey: 'cantidad', header: 'Cantidad', cell: ({ row }) => formatNumber(row.original.cantidad) },
      { accessorKey: 'montoUsd', header: 'Monto USD', cell: ({ row }) => formatMoney(row.original.montoUsd) },
      { accessorKey: 'montoBs', header: 'Monto Bs', cell: ({ row }) => formatMoney(row.original.montoBs) },
      { accessorKey: 'ticketPromedioUsd', header: 'Ticket prom.', cell: ({ row }) => formatMoney(row.original.ticketPromedioUsd) },
      { accessorKey: 'tasaPromedioPonderada', header: 'Tasa prom.', cell: ({ row }) => formatRate(row.original.tasaPromedioPonderada) },
      { accessorKey: 'pctValidado', header: '% validado', cell: ({ row }) => formatPercent(row.original.pctValidado) },
      { accessorKey: 'pctRechazado', header: '% rechazado', cell: ({ row }) => formatPercent(row.original.pctRechazado) },
    ],
    [],
  );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TablaWrapper filtros={filtros} tipo="por-cobrador">
      <DataTable
        columns={columns}
        data={q.data?.data ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => String(r.cobradorId)}
        pagination={paginacionReporte(q.data?.meta, onPageChange)}
        mobileCard={(row) => (
          <div className="space-y-2">
            <p className="font-medium">{row.cobrador}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Cantidad</dt>
                <dd className="tabular-nums">{formatNumber(row.cantidad)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ticket prom.</dt>
                <dd className="tabular-nums">{formatMoney(row.ticketPromedioUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto USD</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.montoUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto Bs</dt>
                <dd className="tabular-nums">{formatMoney(row.montoBs)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tasa prom.</dt>
                <dd className="tabular-nums">{formatRate(row.tasaPromedioPonderada)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">% validado</dt>
                <dd className="tabular-nums">{formatPercent(row.pctValidado)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">% rechazado</dt>
                <dd className="tabular-nums">{formatPercent(row.pctRechazado)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin datos"
      />
    </TablaWrapper>
  );
}

function NuevoViejoTab({ filtros, onPageChange }: ReportTabProps) {
  const q = useQuery({
    queryKey: queryKeys.reporte('nuevo-viejo', filtros),
    queryFn: () => reportesApi.nuevoViejo(filtros),
    staleTime: STALE_LISTS,
  });
  const columns = useMemo<ColumnDef<NonNullable<typeof q.data>['data'][number], unknown>[]>(
    () => [
      { accessorKey: 'fecha', header: 'Fecha', cell: ({ row }) => formatDate(row.original.fecha) },
      { accessorKey: 'nuevoUsd', header: 'Nuevo USD', cell: ({ row }) => formatMoney(row.original.nuevoUsd) },
      { accessorKey: 'viejoUsd', header: 'Viejo USD', cell: ({ row }) => formatMoney(row.original.viejoUsd) },
      { accessorKey: 'nuevoCantidad', header: 'Nuevo cant.', cell: ({ row }) => formatNumber(row.original.nuevoCantidad) },
      { accessorKey: 'viejoCantidad', header: 'Viejo cant.', cell: ({ row }) => formatNumber(row.original.viejoCantidad) },
    ],
    [],
  );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TablaWrapper filtros={filtros} tipo="nuevo-viejo">
      {q.data && (
        <ResumenCard
          items={[
            { label: 'Nuevo USD', value: `${formatMoney(q.data.resumen.nuevo.montoUsd)} (${formatPercent(q.data.resumen.nuevo.participacionPct)})` },
            { label: 'Viejo USD', value: `${formatMoney(q.data.resumen.viejo.montoUsd)} (${formatPercent(q.data.resumen.viejo.participacionPct)})` },
            { label: 'Nuevo cant.', value: formatNumber(q.data.resumen.nuevo.cantidad) },
            { label: 'Viejo cant.', value: formatNumber(q.data.resumen.viejo.cantidad) },
          ]}
        />
      )}
      <DataTable
        columns={columns}
        data={q.data?.data ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => r.fecha}
        mobileCard={(row) => (
          <div className="space-y-2">
            <p className="font-medium tabular-nums">{formatDate(row.fecha)}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Nuevo USD</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.nuevoUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Viejo USD</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.viejoUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Nuevo cant.</dt>
                <dd className="tabular-nums">{formatNumber(row.nuevoCantidad)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Viejo cant.</dt>
                <dd className="tabular-nums">{formatNumber(row.viejoCantidad)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin datos"
        pagination={paginacionReporte(q.data?.meta, onPageChange)}
      />
    </TablaWrapper>
  );
}

function TasasTab({ filtros, onPageChange }: ReportTabProps) {
  const q = useQuery({
    queryKey: queryKeys.reporte('tasas', filtros),
    queryFn: () => reportesApi.tasas(filtros),
    staleTime: STALE_LISTS,
  });
  const columns = useMemo<ColumnDef<NonNullable<typeof q.data>['data'][number], unknown>[]>(
    () => [
      { accessorKey: 'fecha', header: 'Fecha', cell: ({ row }) => formatDate(row.original.fecha) },
      { accessorKey: 'cantidad', header: 'Cantidad', cell: ({ row }) => formatNumber(row.original.cantidad) },
      { accessorKey: 'montoUsd', header: 'Monto USD', cell: ({ row }) => formatMoney(row.original.montoUsd) },
      { accessorKey: 'tasaImplicita', header: 'Tasa implícita', cell: ({ row }) => formatRate(row.original.tasaImplicita) },
      { accessorKey: 'tasaReferencia', header: 'Tasa ref.', cell: ({ row }) => formatRate(row.original.tasaReferencia) },
      { accessorKey: 'desviacionPct', header: 'Desviación', cell: ({ row }) => formatPercent(row.original.desviacionPct) },
      { accessorKey: 'atipico', header: 'Atípico', cell: ({ row }) => (row.original.atipico ? 'Sí' : 'No') },
    ],
    [],
  );
  const colCob = useMemo<ColumnDef<NonNullable<typeof q.data>['porCobrador'][number], unknown>[]>(
    () => [
      { accessorKey: 'cobrador', header: 'Cobrador', cell: ({ row }) => row.original.cobrador },
      { accessorKey: 'cantidad', header: 'Cantidad', cell: ({ row }) => formatNumber(row.original.cantidad) },
      { accessorKey: 'montoUsd', header: 'Monto USD', cell: ({ row }) => formatMoney(row.original.montoUsd) },
      { accessorKey: 'tasaImplicita', header: 'Tasa implícita', cell: ({ row }) => formatRate(row.original.tasaImplicita) },
      { accessorKey: 'desviacionPct', header: 'Desviación', cell: ({ row }) => formatPercent(row.original.desviacionPct) },
    ],
    [],
  );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TablaWrapper filtros={filtros} tipo="tasas">
      {q.data && (
        <ResumenCard
          items={[
            { label: 'Tasa implícita global', value: formatRate(q.data.resumen.tasaImplicitaGlobal) },
            { label: 'Tasa ref. promedio', value: formatRate(q.data.resumen.tasaReferenciaPromedio) },
            { label: 'Días atípicos', value: formatNumber(q.data.resumen.diasAtipicos) },
          ]}
        />
      )}
      <h3 className="mb-2 text-sm font-semibold">Por día</h3>
      <DataTable
        columns={columns}
        data={q.data?.data ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => r.fecha}
        mobileCard={(row) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium tabular-nums">{formatDate(row.fecha)}</p>
              {row.atipico && <Badge variant="warning">Atípico</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Tasa implícita</dt>
                <dd className="font-medium tabular-nums">{formatRate(row.tasaImplicita)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tasa ref.</dt>
                <dd className="tabular-nums">{formatRate(row.tasaReferencia)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Desviación</dt>
                <dd className="tabular-nums">{formatPercent(row.desviacionPct)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cantidad</dt>
                <dd className="tabular-nums">{formatNumber(row.cantidad)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Monto USD</dt>
                <dd className="tabular-nums">{formatMoney(row.montoUsd)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin datos"
        pagination={paginacionReporte(q.data?.meta, onPageChange)}
      />
      <h3 className="mb-2 mt-5 text-sm font-semibold">Por cobrador</h3>
      <DataTable
        columns={colCob}
        data={q.data?.porCobrador ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => String(r.cobradorId)}
        mobileCard={(row) => (
          <div className="space-y-2">
            <p className="font-medium">{row.cobrador}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Cantidad</dt>
                <dd className="tabular-nums">{formatNumber(row.cantidad)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto USD</dt>
                <dd className="tabular-nums">{formatMoney(row.montoUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tasa implícita</dt>
                <dd className="tabular-nums">{formatRate(row.tasaImplicita)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Desviación</dt>
                <dd className="tabular-nums">{formatPercent(row.desviacionPct)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin datos"
      />
    </TablaWrapper>
  );
}

function PendientesTab({ filtros, onPageChange }: ReportTabProps) {
  const q = useQuery({
    queryKey: queryKeys.reporte('pendientes', filtros),
    queryFn: () => reportesApi.pendientes(filtros),
    staleTime: STALE_LISTS,
  });
  const columns = useMemo<ColumnDef<NonNullable<typeof q.data>['data'][number], unknown>[]>(
    () => [
      { accessorKey: 'fechaPago', header: 'Fecha pago', cell: ({ row }) => formatDate(row.original.fechaPago) },
      { accessorKey: 'antiguedadHoras', header: 'Antigüedad', cell: ({ row }) => formatAntiguedad(row.original.antiguedadHoras) },
      { accessorKey: 'cobrador', header: 'Cobrador' },
      { accessorKey: 'banco', header: 'Banco' },
      { accessorKey: 'referencia', header: 'Referencia' },
      { accessorKey: 'montoUsd', header: 'Monto USD', cell: ({ row }) => formatMoney(row.original.montoUsd) },
      { accessorKey: 'montoBs', header: 'Monto Bs', cell: ({ row }) => formatMoney(row.original.montoBs) },
    ],
    [],
  );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TablaWrapper filtros={filtros} tipo="pendientes">
      <DataTable
        columns={columns}
        data={q.data?.data ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => String(r.id)}
        mobileCard={(row) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.referencia}</p>
                <p className="text-xs text-muted-foreground">{formatDate(row.fechaPago)}</p>
              </div>
              <Badge variant="warning">{formatAntiguedad(row.antiguedadHoras)}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Cobrador</dt>
                <dd className="truncate">{row.cobrador}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Banco</dt>
                <dd className="truncate">{row.banco}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto USD</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.montoUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto Bs</dt>
                <dd className="tabular-nums">{formatMoney(row.montoBs)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin pendientes"
        pagination={paginacionReporte(q.data?.meta, onPageChange)}
      />
    </TablaWrapper>
  );
}

function MovimientosNoConciliadosTab({ filtros, onPageChange }: ReportTabProps) {
  const q = useQuery({
    queryKey: queryKeys.reporte('movimientos-no-conciliados', filtros),
    queryFn: () => reportesApi.movimientosNoConciliados(filtros),
    staleTime: STALE_LISTS,
  });
  const columns = useMemo<ColumnDef<NonNullable<typeof q.data>['data'][number], unknown>[]>(
    () => [
      { accessorKey: 'fechaEjecucion', header: 'Fecha ejecución', cell: ({ row }) => formatDate(row.original.fechaEjecucion) },
      { accessorKey: 'referencia', header: 'Referencia' },
      { id: 'banco', header: 'Banco', cell: ({ row }) => row.original.cuentaRecaudadora.banco.nombre },
      { id: 'cuenta', header: 'Cuenta', cell: ({ row }) => row.original.cuentaRecaudadora.numeroCuenta },
      { accessorKey: 'montoBs', header: 'Monto Bs', cell: ({ row }) => formatMoney(row.original.montoBs) },
    ],
    [],
  );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TablaWrapper filtros={filtros} tipo="movimientos-no-conciliados">
      {q.data && (
        <ResumenCard
          items={[
            { label: 'Total no conciliado (Bs)', value: formatMoney(q.data.totales.totalBs) },
            { label: 'No conciliados', value: formatNumber(q.data.totales.cantidad) },
          ]}
        />
      )}
      <DataTable
        columns={columns}
        data={q.data?.data ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => String(r.id)}
        mobileCard={(row) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.referencia}</p>
                <p className="text-xs text-muted-foreground">{formatDate(row.fechaEjecucion)}</p>
              </div>
              <Badge variant="warning">No conciliado</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div className="col-span-2">
                <dt className="text-muted-foreground">Cuenta recaudadora</dt>
                <dd className="truncate">
                  {row.cuentaRecaudadora.banco.nombre}{' '}
                  <span className="text-muted-foreground">{row.cuentaRecaudadora.numeroCuenta}</span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto Bs</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.montoBs)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin movimientos no conciliados"
        pagination={paginacionReporte(q.data?.meta, onPageChange)}
      />
    </TablaWrapper>
  );
}

function PagosSinRespaldoTab({ filtros, onPageChange }: ReportTabProps) {
  const q = useQuery({
    queryKey: queryKeys.reporte('pagos-sin-respaldo', filtros),
    queryFn: () => reportesApi.pagosSinRespaldo(filtros),
    staleTime: STALE_LISTS,
  });
  const columns = useMemo<ColumnDef<NonNullable<typeof q.data>['data'][number], unknown>[]>(
    () => [
      { accessorKey: 'fechaPago', header: 'Fecha pago', cell: ({ row }) => formatDate(row.original.fechaPago) },
      { accessorKey: 'referencia', header: 'Referencia' },
      { id: 'cobrador', header: 'Cobrador', cell: ({ row }) => row.original.cobrador.nombre },
      { id: 'banco', header: 'Banco', cell: ({ row }) => row.original.cuentaRecaudadora.banco.nombre },
      { accessorKey: 'montoUsd', header: 'Monto USD', cell: ({ row }) => formatMoney(row.original.montoUsd) },
      { accessorKey: 'montoBs', header: 'Monto Bs', cell: ({ row }) => formatMoney(row.original.montoBs) },
      { accessorKey: 'estado', header: 'Estado' },
    ],
    [],
  );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TablaWrapper filtros={filtros} tipo="pagos-sin-respaldo">
      <DataTable
        columns={columns}
        data={q.data?.data ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => String(r.id)}
        mobileCard={(row) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.referencia}</p>
                <p className="text-xs text-muted-foreground">{formatDate(row.fechaPago)}</p>
              </div>
              <EstadoBadge estado={row.estado} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Cobrador</dt>
                <dd className="truncate">{row.cobrador.nombre}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Banco</dt>
                <dd className="truncate">{row.cuentaRecaudadora.banco.nombre}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto USD</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.montoUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Monto Bs</dt>
                <dd className="tabular-nums">{formatMoney(row.montoBs)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin pagos sin respaldo"
        pagination={paginacionReporte(q.data?.meta, onPageChange)}
      />
    </TablaWrapper>
  );
}

function FlujoCajaTab({ filtros, onPageChange }: ReportTabProps) {
  const q = useQuery({
    queryKey: queryKeys.reporte('flujo-caja', filtros),
    queryFn: () => reportesApi.flujoCaja(filtros),
    staleTime: STALE_LISTS,
  });
  const columns = useMemo<ColumnDef<NonNullable<typeof q.data>['data'][number], unknown>[]>(
    () => [
      { accessorKey: 'fecha', header: 'Fecha', cell: ({ row }) => formatDate(row.original.fecha) },
      { accessorKey: 'ingresosUsd', header: 'Ingresos USD', cell: ({ row }) => formatMoney(row.original.ingresosUsd) },
      { accessorKey: 'gastosUsd', header: 'Gastos USD', cell: ({ row }) => formatMoney(row.original.gastosUsd) },
      { accessorKey: 'flujoUsd', header: 'Flujo USD', cell: ({ row }) => formatMoney(row.original.flujoUsd) },
      { accessorKey: 'acumuladoUsd', header: 'Acumulado USD', cell: ({ row }) => formatMoney(row.original.acumuladoUsd) },
      { accessorKey: 'ingresosBs', header: 'Ingresos Bs', cell: ({ row }) => formatMoney(row.original.ingresosBs) },
      { accessorKey: 'gastosBs', header: 'Gastos Bs', cell: ({ row }) => formatMoney(row.original.gastosBs) },
      { accessorKey: 'flujoBs', header: 'Flujo Bs', cell: ({ row }) => formatMoney(row.original.flujoBs) },
    ],
    [],
  );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TablaWrapper filtros={filtros} tipo="flujo-caja">
      {q.data && (
        <ResumenCard
          items={[
            { label: 'Ingresos USD', value: formatMoney(q.data.totales.ingresosUsd) },
            { label: 'Gastos USD', value: formatMoney(q.data.totales.gastosUsd) },
            { label: 'Flujo USD', value: formatMoney(q.data.totales.flujoUsd) },
            { label: 'Flujo Bs', value: formatMoney(q.data.totales.flujoBs) },
          ]}
        />
      )}
      <DataTable
        columns={columns}
        data={q.data?.data ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => r.fecha}
        mobileCard={(row) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium tabular-nums">{formatDate(row.fecha)}</p>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Flujo USD</p>
                <p className="font-semibold tabular-nums">{formatMoney(row.flujoUsd)}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Ingresos USD</dt>
                <dd className="tabular-nums">{formatMoney(row.ingresosUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gastos USD</dt>
                <dd className="tabular-nums">{formatMoney(row.gastosUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Acumulado USD</dt>
                <dd className="tabular-nums">{formatMoney(row.acumuladoUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ingresos Bs</dt>
                <dd className="tabular-nums text-muted-foreground">{formatMoney(row.ingresosBs)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gastos Bs</dt>
                <dd className="tabular-nums text-muted-foreground">{formatMoney(row.gastosBs)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Flujo Bs</dt>
                <dd className="tabular-nums text-muted-foreground">{formatMoney(row.flujoBs)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin movimientos de caja"
        pagination={paginacionReporte(q.data?.meta, onPageChange)}
      />
    </TablaWrapper>
  );
}

function GastosTab({ filtros, onPageChange }: ReportTabProps) {
  const q = useQuery({
    queryKey: queryKeys.reporte('gastos', filtros),
    queryFn: () => reportesApi.gastos(filtros),
    staleTime: STALE_LISTS,
  });
  const colCat = useMemo<ColumnDef<NonNullable<typeof q.data>['data'][number], unknown>[]>(
    () => [
      { accessorKey: 'categoria', header: 'Categoría' },
      { accessorKey: 'cantidad', header: 'Cantidad', cell: ({ row }) => formatNumber(row.original.cantidad) },
      { accessorKey: 'totalUsd', header: 'Total USD', cell: ({ row }) => formatMoney(row.original.totalUsd) },
      { accessorKey: 'totalBs', header: 'Total Bs', cell: ({ row }) => formatMoney(row.original.totalBs) },
    ],
    [],
  );
  const colAut = useMemo<ColumnDef<NonNullable<typeof q.data>['porAutorizadoPor'][number], unknown>[]>(
    () => [
      { accessorKey: 'autorizadoPor', header: 'Autorizado por' },
      { accessorKey: 'cantidad', header: 'Cantidad', cell: ({ row }) => formatNumber(row.original.cantidad) },
      { accessorKey: 'totalUsd', header: 'Total USD', cell: ({ row }) => formatMoney(row.original.totalUsd) },
      { accessorKey: 'totalBs', header: 'Total Bs', cell: ({ row }) => formatMoney(row.original.totalBs) },
    ],
    [],
  );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <TablaWrapper filtros={filtros} tipo="gastos">
      <h3 className="mb-2 text-sm font-semibold">Por categoría</h3>
      <DataTable
        columns={colCat}
        data={q.data?.data ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => r.categoria}
        mobileCard={(row) => (
          <div className="space-y-2">
            <p className="font-medium">{row.categoria}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Cantidad</dt>
                <dd className="tabular-nums">{formatNumber(row.cantidad)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total USD</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.totalUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total Bs</dt>
                <dd className="tabular-nums">{formatMoney(row.totalBs)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin gastos"
        pagination={paginacionReporte(q.data?.meta, onPageChange)}
      />
      <h3 className="mb-2 mt-5 text-sm font-semibold">Por autorizante</h3>
      <DataTable
        columns={colAut}
        data={q.data?.porAutorizadoPor ?? []}
        isLoading={q.isLoading}
        getRowId={(r) => r.autorizadoPor}
        mobileCard={(row) => (
          <div className="space-y-2">
            <p className="font-medium">{row.autorizadoPor}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Cantidad</dt>
                <dd className="tabular-nums">{formatNumber(row.cantidad)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total USD</dt>
                <dd className="font-medium tabular-nums">{formatMoney(row.totalUsd)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total Bs</dt>
                <dd className="tabular-nums">{formatMoney(row.totalBs)}</dd>
              </div>
            </dl>
          </div>
        )}
        emptyTitle="Sin gastos"
      />
    </TablaWrapper>
  );
}

export default function ReportesPage() {
  const [tab, setTab] = useState<TipoReporte>('cobros');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [cobradorId, setCobradorId] = useState('');
  const [bancoId, setBancoId] = useState('');
  const [estado, setEstado] = useState('');
  const [page, setPage] = useState(1);

  // Reset to the first page whenever the filters (or the active report) change.
  useEffect(() => {
    setPage(1);
  }, [fechaDesde, fechaHasta, cobradorId, bancoId, estado, tab]);

  const cobradores = useQuery({
    queryKey: queryKeys.cobradores({ pageSize: 200, activo: true }),
    queryFn: () => listarCobradores({ pageSize: 200, activo: true }),
    staleTime: STALE_CATALOGS,
  });
  const cobradoresConNombre = useMemo(
    () => (cobradores.data?.data ?? []).filter((c) => c.nombre.trim() !== ''),
    [cobradores.data],
  );
  const catalogos = useQuery({
    queryKey: queryKeys.catalogoFormPago(),
    queryFn: getCatalogoFormPago,
    staleTime: STALE_CATALOGS,
  });

  const filtros = useMemo<ReporteFiltros>(
    () => ({
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      cobradorId: cobradorId ? Number(cobradorId) : undefined,
      bancoId: bancoId ? Number(bancoId) : undefined,
      estado: estado || undefined,
      page,
      pageSize: REPORT_PAGE_SIZE,
    }),
    [fechaDesde, fechaHasta, cobradorId, bancoId, estado, page],
  );

  const renderTab = () => {
    switch (tab) {
      case 'cobros':
        return <CobrosTab filtros={filtros} onPageChange={setPage} />;
      case 'por-cobrador':
        return <PorCobradorTab filtros={filtros} onPageChange={setPage} />;
      case 'nuevo-viejo':
        return <NuevoViejoTab filtros={filtros} onPageChange={setPage} />;
      case 'tasas':
        return <TasasTab filtros={filtros} onPageChange={setPage} />;
      case 'pendientes':
        return <PendientesTab filtros={filtros} onPageChange={setPage} />;
      case 'movimientos-no-conciliados':
        return <MovimientosNoConciliadosTab filtros={filtros} onPageChange={setPage} />;
      case 'pagos-sin-respaldo':
        return <PagosSinRespaldoTab filtros={filtros} onPageChange={setPage} />;
      case 'flujo-caja':
        return <FlujoCajaTab filtros={filtros} onPageChange={setPage} />;
      case 'gastos':
        return <GastosTab filtros={filtros} onPageChange={setPage} />;
      default:
        return <EmptyState title="Reporte no disponible" />;
    }
  };

  return (
    <div>
      <PageHeader
        title="Reportes"
        description="Reportes consolidados en USD y Bs, exportables a Excel y PDF."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="r-desde">Desde</Label>
          <Input id="r-desde" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-hasta">Hasta</Label>
          <Input id="r-hasta" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-cobrador">Cobrador</Label>
          <Select id="r-cobrador" value={cobradorId} onChange={(e) => setCobradorId(e.target.value)}>
            <option value="">Todos</option>
            {cobradoresConNombre.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-banco">Banco</Label>
          <Select id="r-banco" value={bancoId} onChange={(e) => setBancoId(e.target.value)}>
            <option value="">Todos</option>
            {catalogos.data?.bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-estado">Estado</Label>
          <Select id="r-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="validado">Validado</option>
            <option value="rechazado">Rechazado</option>
            <option value="duplicado">Duplicado</option>
          </Select>
        </div>
        <div className="flex items-end">
          <ClearFiltersButton
            current={{ fechaDesde, fechaHasta, cobradorId, bancoId, estado }}
            initial={{ fechaDesde: '', fechaHasta: '', cobradorId: '', bancoId: '', estado: '' }}
            onClear={() => {
              setFechaDesde('');
              setFechaHasta('');
              setCobradorId('');
              setBancoId('');
              setEstado('');
            }}
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TipoReporte)}>
        <TabsList className="w-full justify-start overflow-x-auto no-scrollbar">
          {REPORTES.map((r) => (
            <TabsTrigger key={r.tipo} value={r.tipo}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab}>{renderTab()}</TabsContent>
      </Tabs>

      <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Los importes se muestran en USD salvo indicación contraria, con formato es-VE (dinero 2
        decimales, tasas 6 decimales).
      </p>
    </div>
  );
}
