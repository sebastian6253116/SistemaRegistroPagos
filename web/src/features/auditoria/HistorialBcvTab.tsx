import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { listarHistorialBcv } from '@/api/tasasBcv';
import { queryKeys, STALE_LISTS } from '@/lib/queryClient';
import { formatDateTime, formatRate } from '@/lib/format';
import { DataTable } from '@/components/common/DataTable';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TasaBcv } from '@/types';

const PAGE_SIZE = 25;

export default function HistorialBcvTab() {
  const [page, setPage] = useState(1);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    }),
    [page, fechaDesde, fechaHasta],
  );

  const query = useQuery({
    queryKey: queryKeys.tasaBcvHistorial(params),
    queryFn: () => listarHistorialBcv(params),
    staleTime: STALE_LISTS,
  });

  const columns = useMemo<ColumnDef<TasaBcv, unknown>[]>(
    () => [
      {
        accessorKey: 'fechaApi',
        header: 'Fecha',
        cell: ({ row }) => formatDateTime(row.original.fechaApi),
      },
      {
        accessorKey: 'usd',
        header: 'Tasa (Bs/USD)',
        cell: ({ row }) => <span className="tabular-nums">{formatRate(row.original.usd)}</span>,
      },
      { accessorKey: 'fuente', header: 'Fuente', cell: ({ row }) => row.original.fuente ?? '—' },
    ],
    [],
  );

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
        <div className="space-y-1.5">
          <Label htmlFor="bcv-desde">Desde</Label>
          <Input
            id="bcv-desde"
            type="date"
            value={fechaDesde}
            onChange={(e) => {
              setFechaDesde(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bcv-hasta">Hasta</Label>
          <Input
            id="bcv-hasta"
            type="date"
            value={fechaHasta}
            onChange={(e) => {
              setFechaHasta(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-end">
          <ClearFiltersButton
            current={{ fechaDesde, fechaHasta }}
            initial={{ fechaDesde: '', fechaHasta: '' }}
            onClear={() => {
              setFechaDesde('');
              setFechaHasta('');
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
          getRowId={(r) => String(r.id)}
          mobileCard={(row) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium tabular-nums">{formatRate(row.usd)}</p>
                  <p className="text-xs text-muted-foreground">Bs/USD</p>
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
                <div>
                  <dt className="text-muted-foreground">Publicada</dt>
                  <dd className="tabular-nums">{formatDateTime(row.fechaApi)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Fuente</dt>
                  <dd>{row.fuente ?? '—'}</dd>
                </div>
              </dl>
            </div>
          )}
          emptyTitle="Sin registros de tasa BCV"
          emptyDescription="Todavía no se ha sincronizado ninguna tasa o ninguna coincide con el rango de fechas."
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
    </div>
  );
}
