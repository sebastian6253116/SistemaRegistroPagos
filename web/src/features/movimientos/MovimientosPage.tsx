import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileSpreadsheet, Link2 } from 'lucide-react';
import { listarMovimientos } from '@/api/movimientos';
import { obtenerLote } from '@/api/importacion';
import { listarCuentas } from '@/api/cuentas';
import { queryKeys, STALE_CATALOGS, STALE_LISTS } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { formatBs, formatDate, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { DateRangeFilter } from '@/components/common/DateRangeFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/spinner';
import type { MovimientoBanco } from '@/types';

const PAGE_SIZE = 20;

function LoteDetalleDialog({ loteId, onClose }: { loteId: number | null; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['importacion', 'lote', loteId],
    queryFn: () => obtenerLote(loteId as number),
    enabled: loteId !== null,
  });

  return (
    <Dialog
      open={loteId !== null}
      onClose={onClose}
      title="Lote de importación"
      description="Detalle del lote que originó el movimiento bancario."
      footer={<Button variant="outline" onClick={onClose}>Cerrar</Button>}
    >
      {query.isLoading ? (
        <LoadingState />
      ) : query.data ? (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Archivo</dt>
            <dd className="font-medium">{query.data.nombreArchivo}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fecha de importación</dt>
            <dd className="font-medium">{formatDateTime(query.data.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Importado por</dt>
            <dd className="font-medium">{query.data.usuario.nombreCompleto}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Filas</dt>
            <dd className="font-medium">
              {query.data.filasTotales} totales · {query.data.insertadas} insertadas
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Duplicadas</dt>
            <dd className="font-medium">{query.data.duplicadas}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Con error</dt>
            <dd className="font-medium">{query.data.conError}</dd>
          </div>
        </dl>
      ) : (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      )}
    </Dialog>
  );
}

export default function MovimientosPage() {
  const [page, setPage] = useState(1);
  const [estadoConciliacion, setEstadoConciliacion] = useState('');
  const [cuentaRecaudadoraId, setCuentaRecaudadoraId] = useState('');
  const [referencia, setReferencia] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [loteId, setLoteId] = useState<number | null>(null);
  const debouncedRef = useDebounce(referencia, 300);

  const cuentas = useQuery({
    queryKey: queryKeys.cuentas({ pageSize: 200 }),
    queryFn: () => listarCuentas({ pageSize: 200 }),
    staleTime: STALE_CATALOGS,
  });

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      estadoConciliacion: estadoConciliacion || undefined,
      cuentaRecaudadoraId: cuentaRecaudadoraId || undefined,
      referencia: debouncedRef || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    }),
    [page, estadoConciliacion, cuentaRecaudadoraId, debouncedRef, fechaDesde, fechaHasta],
  );

  const query = useQuery({
    queryKey: queryKeys.movimientos(params),
    queryFn: () => listarMovimientos(params),
    staleTime: STALE_LISTS,
  });

  const columns = useMemo<ColumnDef<MovimientoBanco, unknown>[]>(
    () => [
      {
        accessorKey: 'fechaEjecucion',
        header: 'Fecha ejecución',
        cell: ({ row }) => formatDate(row.original.fechaEjecucion),
      },
      { accessorKey: 'referencia', header: 'Referencia' },
      {
        id: 'cuenta',
        header: 'Cuenta recaudadora',
        cell: ({ row }) => (
          <span>
            {row.original.cuentaRecaudadora.banco.nombre}
            <span className="ml-1 text-xs text-muted-foreground">
              {row.original.cuentaRecaudadora.numeroCuenta}
            </span>
          </span>
        ),
      },
      {
        accessorKey: 'montoBs',
        header: 'Monto Bs',
        cell: ({ row }) => <span className="font-medium tabular-nums">{formatBs(row.original.montoBs)}</span>,
      },
      {
        id: 'estado',
        header: 'Conciliación',
        cell: ({ row }) =>
          row.original.estadoConciliacion === 'conciliado' ? (
            <Badge variant="success">Conciliado</Badge>
          ) : (
            <Badge variant="warning">No conciliado</Badge>
          ),
      },
      {
        id: 'pago',
        header: 'Pago vinculado',
        cell: ({ row }) =>
          row.original.pago ? (
            <span className="text-xs">
              {row.original.pago.referencia} · {row.original.pago.cobrador.nombre}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: 'lote',
        header: 'Lote origen',
        cell: ({ row }) =>
          row.original.lote ? (
            <Button variant="ghost" size="sm" onClick={() => setLoteId(row.original.lote!.id)}>
              <Link2 className="h-4 w-4" />
              {row.original.lote.nombreArchivo}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Movimientos bancarios"
        description="Ingresos importados desde el banco recaudador. Filtre por estado de conciliación."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <DateRangeFilter
          desde={fechaDesde}
          hasta={fechaHasta}
          idPrefix="m"
          onDesdeChange={(value) => { setFechaDesde(value); setPage(1); }}
          onHastaChange={(value) => { setFechaHasta(value); setPage(1); }}
        />
        <div className="space-y-1.5">
          <Label htmlFor="m-estado">Conciliación</Label>
          <Select id="m-estado" value={estadoConciliacion} onChange={(e) => { setEstadoConciliacion(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="no_conciliado">No conciliado</option>
            <option value="conciliado">Conciliado</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-cuenta">Cuenta recaudadora</Label>
          <Select id="m-cuenta" value={cuentaRecaudadoraId} onChange={(e) => { setCuentaRecaudadoraId(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {cuentas.data?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.banco.nombre} — {c.numeroCuenta}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-ref">Referencia</Label>
          <Input id="m-ref" value={referencia} onChange={(e) => { setReferencia(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-end">
          <ClearFiltersButton
            current={{ fechaDesde, fechaHasta, estadoConciliacion, cuentaRecaudadoraId, referencia }}
            initial={{ fechaDesde: '', fechaHasta: '', estadoConciliacion: '', cuentaRecaudadoraId: '', referencia: '' }}
            onClear={() => {
              setFechaDesde('');
              setFechaHasta('');
              setEstadoConciliacion('');
              setCuentaRecaudadoraId('');
              setReferencia('');
              setPage(1);
            }}
          />
        </div>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          isLoading={query.isLoading}
          getRowId={(row) => String(row.id)}
          mobileCard={(row) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.referencia}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(row.fechaEjecucion)}</p>
                </div>
                {row.estadoConciliacion === 'conciliado' ? (
                  <Badge variant="success">Conciliado</Badge>
                ) : (
                  <Badge variant="warning">No conciliado</Badge>
                )}
              </div>
              <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
                <div>
                  <dt className="text-muted-foreground">Cuenta recaudadora</dt>
                  <dd className="truncate">
                    {row.cuentaRecaudadora.banco.nombre}
                    <span className="ml-1 text-muted-foreground">
                      {row.cuentaRecaudadora.numeroCuenta}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Monto Bs</dt>
                  <dd className="font-medium tabular-nums">{formatBs(row.montoBs)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pago vinculado</dt>
                  <dd className="truncate">
                    {row.pago ? (
                      `${row.pago.referencia} · ${row.pago.cobrador.nombre}`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
              </dl>
              {row.lote && (
                <Button variant="outline" size="sm" onClick={() => setLoteId(row.lote!.id)}>
                  <Link2 className="h-4 w-4" />
                  {row.lote.nombreArchivo}
                </Button>
              )}
            </div>
          )}
          emptyTitle="Sin movimientos bancarios"
          emptyDescription="No hay movimientos que coincidan con los filtros. Importe el estado de cuenta del banco."
          emptyAction={
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              Use la sección Importación para cargar el archivo del banco.
            </span>
          }
          pagination={
            query.data
              ? {
                  page: query.data.meta.page,
                  pageSize: query.data.meta.pageSize,
                  total: query.data.meta.total,
                  totalPages: query.data.meta.totalPages,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      )}

      <LoteDetalleDialog loteId={loteId} onClose={() => setLoteId(null)} />
    </div>
  );
}
