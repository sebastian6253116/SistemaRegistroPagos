import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { actualizarTasa, crearTasa, eliminarTasa, listarTasas, type TasaInput } from '@/api/tasas';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_LISTS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { formatDate, formatRate, todayInputDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { TasaReferencia } from '@/types';

const PAGE_SIZE = 20;

export default function TasasTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [page, setPage] = useState(1);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<TasaReferencia | null>(null);
  const [form, setForm] = useState({ fecha: todayInputDate(), valor: '', fuente: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [eliminarTarget, setEliminarTarget] = useState<TasaReferencia | null>(null);

  const params = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, fechaDesde: fechaDesde || undefined, fechaHasta: fechaHasta || undefined }),
    [page, fechaDesde, fechaHasta],
  );

  const query = useQuery({
    queryKey: queryKeys.tasas(params),
    queryFn: () => listarTasas(params),
    staleTime: STALE_LISTS,
  });

  const guardar = useMutation({
    mutationFn: () => {
      const payload: TasaInput = {
        fecha: form.fecha,
        valor: form.valor.replace(',', '.'),
        fuente: form.fuente.trim() || null,
      };
      return editando ? actualizarTasa(editando.id, payload) : crearTasa(payload);
    },
    onSuccess: () => {
      toast.success(editando ? 'Tasa actualizada' : 'Tasa registrada', 'Si ya existía una tasa para esa fecha, fue reemplazada.');
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['tasas'] });
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => eliminarTasa(id),
    onSuccess: () => {
      toast.success('Tasa eliminada');
      setEliminarTarget(null);
      queryClient.invalidateQueries({ queryKey: ['tasas'] });
    },
    onError: (error) => toast.error('No se pudo eliminar', getApiErrorMessage(error)),
  });

  const valorValido = /^\d+(?:\.\d{1,6})?$/.test(form.valor.replace(',', '.'));

  const columns = useMemo<ColumnDef<TasaReferencia, unknown>[]>(
    () => [
      { accessorKey: 'fecha', header: 'Fecha', cell: ({ row }) => formatDate(row.original.fecha) },
      {
        accessorKey: 'valor',
        header: 'Tasa (Bs/USD)',
        cell: ({ row }) => <span className="tabular-nums">{formatRate(row.original.valor)}</span>,
      },
      { accessorKey: 'fuente', header: 'Fuente', cell: ({ row }) => row.original.fuente ?? '—' },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {tiene('tasas.gestionar') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar"
                onClick={() => {
                  setEditando(row.original);
                  setForm({ fecha: row.original.fecha.slice(0, 10), valor: row.original.valor, fuente: row.original.fuente ?? '' });
                  setFormError(null);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {tiene('tasas.gestionar') && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Eliminar"
                onClick={() => setEliminarTarget(row.original)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [tiene],
  );

  return (
    <div>
      <PageHeader
        title="Tasas de referencia"
        description="Una tasa por día. Solo informativa: permite comparar contra la tasa implícita de los cobros."
        actions={
          tiene('tasas.gestionar') ? (
            <Button
              onClick={() => {
                setEditando(null);
                setForm({ fecha: todayInputDate(), valor: '', fuente: '' });
                setFormError(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nueva tasa
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="t-desde">Desde</Label>
          <Input id="t-desde" type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-hasta">Hasta</Label>
          <Input id="t-hasta" type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }} />
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
                  <p className="font-medium tabular-nums">{formatRate(row.valor)}</p>
                  <p className="text-xs text-muted-foreground">Bs/USD</p>
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(row.fecha)}</p>
              </div>
              <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
                <div>
                  <dt className="text-muted-foreground">Fuente</dt>
                  <dd>{row.fuente ?? '—'}</dd>
                </div>
              </dl>
              {tiene('tasas.gestionar') && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditando(row);
                      setForm({
                        fecha: row.fecha.slice(0, 10),
                        valor: row.valor,
                        fuente: row.fuente ?? '',
                      });
                      setFormError(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setEliminarTarget(row)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                </div>
              )}
            </div>
          )}
          emptyTitle="Sin tasas de referencia"
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

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editando ? 'Editar tasa de referencia' : 'Nueva tasa de referencia'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!form.fecha || !valorValido} loading={guardar.isPending} onClick={() => { setFormError(null); guardar.mutate(); }}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-fecha">Fecha *</Label>
            <Input id="t-fecha" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-valor">Valor (Bs/USD) *</Label>
            <Input id="t-valor" inputMode="decimal" placeholder="Ej. 180.000000" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            {!valorValido && form.valor !== '' && (
              <p className="text-xs text-destructive">Use hasta 6 decimales (punto o coma).</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-fuente">Fuente</Label>
            <Input id="t-fuente" value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })} />
          </div>
          {formError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
        </div>
      </Dialog>

      <ConfirmDialog
        open={eliminarTarget !== null}
        onClose={() => setEliminarTarget(null)}
        onConfirm={() => eliminarTarget && eliminar.mutate(eliminarTarget.id)}
        title="Eliminar tasa de referencia"
        description="¿Confirma que desea eliminar esta tasa?"
        confirmLabel="Eliminar"
        destructive
        loading={eliminar.isPending}
      />
    </div>
  );
}
