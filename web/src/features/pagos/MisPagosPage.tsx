import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import { eliminarPago, listarPagos } from '@/api/pagos';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_LISTS } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermiso } from '@/hooks/usePermiso';
import { formatDate, formatMoney, formatRate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { EstadoBadge, TipoCobroBadge } from './pago-utils';
import { EditarPagoDialog } from './EditarPagoDialog';
import { useToast } from '@/components/ui/toast';
import type { PagoReportado } from '@/types';

const PAGE_SIZE = 20;

export default function MisPagosPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();
  const puedeEliminar = tiene('pagos.eliminar');
  const puedeReportar = tiene('pagos.reportar');
  const puedeEditarValidado = tiene('pagos.editar');

  const [page, setPage] = useState(1);
  const [referencia, setReferencia] = useState('');
  const [estado, setEstado] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const debouncedRef = useDebounce(referencia, 300);

  const [editando, setEditando] = useState<PagoReportado | null>(null);
  const [eliminarTarget, setEliminarTarget] = useState<PagoReportado | null>(null);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      referencia: debouncedRef || undefined,
      estado: estado || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    }),
    [page, debouncedRef, estado, fechaDesde, fechaHasta],
  );

  const query = useQuery({
    queryKey: queryKeys.pagos(params),
    queryFn: () => listarPagos(params),
    staleTime: STALE_LISTS,
  });

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pagos'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['movimientos'] });
  }, [queryClient]);

  const puedeEditarPago = useCallback(
    (pago: PagoReportado) =>
      (pago.estado === 'pendiente' && (puedeReportar || puedeEditarValidado)) ||
      (pago.estado === 'validado' && puedeEditarValidado),
    [puedeReportar, puedeEditarValidado],
  );

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => eliminarPago(id),
    onSuccess: () => {
      toast.success('Pago eliminado');
      setEliminarTarget(null);
      invalidar();
    },
    onError: (error) => toast.error('No se pudo eliminar', getApiErrorMessage(error)),
  });

  const columns = useMemo<ColumnDef<PagoReportado, unknown>[]>(
    () => [
      { accessorKey: 'fechaPago', header: 'Fecha', cell: ({ row }) => formatDate(row.original.fechaPago) },
      { accessorKey: 'referencia', header: 'Referencia' },
      {
        id: 'banco',
        header: 'Banco origen',
        cell: ({ row }) => row.original.bancoOrigen?.nombre ?? 'N/A',
      },
      {
        accessorKey: 'montoBs',
        header: 'Monto Bs',
        cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.montoBs)}</span>,
      },
      {
        accessorKey: 'montoUsd',
        header: 'Monto USD',
        cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.montoUsd)}</span>,
      },
      {
        accessorKey: 'tasa',
        header: 'Tasa',
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{formatRate(row.original.tasa)}</span>,
      },
      {
        id: 'tipo',
        header: 'Tipo',
        cell: ({ row }) => <TipoCobroBadge tipo={row.original.tipoCobroDerivado ?? row.original.tipoCobro} />,
      },
      {
        id: 'estado',
        header: 'Estado',
        cell: ({ row }) => <EstadoBadge estado={row.original.estado} />,
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => {
          const pago = row.original;
          const puedeEditar = puedeEditarPago(pago);
          const puedeBorrar = puedeEliminar && pago.estado !== 'validado';
          if (!puedeEditar && !puedeBorrar) return null;
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              {puedeEditar && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditando(pago)}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              )}
              {puedeBorrar && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setEliminarTarget(pago)}
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [puedeEliminar, puedeEditarPago],
  );

  return (
    <div>
      <PageHeader
        title="Mis pagos"
        description="Historial de los pagos que usted ha reportado. Puede editar pagos pendientes y, con el permiso correspondiente, pagos ya validados."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="fechaDesde">Desde</Label>
          <Input id="fechaDesde" type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fechaHasta">Hasta</Label>
          <Input id="fechaHasta" type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="referencia">Referencia</Label>
          <Input id="referencia" placeholder="Buscar…" value={referencia} onChange={(e) => { setReferencia(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="estado">Estado</Label>
          <Select id="estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="validado">Validado</option>
            <option value="rechazado">Rechazado</option>
            <option value="duplicado">Duplicado</option>
          </Select>
        </div>
        <div className="flex items-end">
          <ClearFiltersButton
            current={{ referencia, estado, fechaDesde, fechaHasta }}
            initial={{ referencia: '', estado: '', fechaDesde: '', fechaHasta: '' }}
            onClear={() => {
              setReferencia('');
              setEstado('');
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
          getRowId={(row) => String(row.id)}
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
                  <dt className="text-muted-foreground">Banco origen</dt>
                  <dd className="truncate">{row.bancoOrigen?.nombre ?? 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Monto Bs</dt>
                  <dd className="font-medium tabular-nums">{formatMoney(row.montoBs)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Monto USD</dt>
                  <dd className="font-medium tabular-nums">{formatMoney(row.montoUsd)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tasa</dt>
                  <dd className="tabular-nums text-muted-foreground">{formatRate(row.tasa)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tipo</dt>
                  <dd>
                    <TipoCobroBadge tipo={row.tipoCobroDerivado ?? row.tipoCobro} />
                  </dd>
                </div>
              </dl>
              {puedeEditarPago(row) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setEditando(row)}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              )}
              {puedeEliminar && row.estado !== 'validado' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => setEliminarTarget(row)}
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              )}
            </div>
          )}
          emptyTitle="Sin pagos reportados"
          emptyDescription="No existen pagos que coincidan con los filtros."
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

      <EditarPagoDialog
        pago={editando}
        onClose={() => setEditando(null)}
        onSuccess={invalidar}
      />

      <ConfirmDialog
        open={eliminarTarget !== null}
        onClose={() => setEliminarTarget(null)}
        onConfirm={() => eliminarTarget && eliminarMutation.mutate(eliminarTarget.id)}
        title="Eliminar pago"
        description="Esta acción es permanente e irreversible: el pago se eliminará definitivamente y no podrá recuperarse. Solo quedará una copia en la auditoría. ¿Confirma que desea eliminarlo?"
        confirmLabel="Eliminar"
        destructive
        loading={eliminarMutation.isPending}
      />
    </div>
  );
}
