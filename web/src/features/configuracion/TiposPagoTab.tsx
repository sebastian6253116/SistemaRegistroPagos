import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import {
  actualizarTipoPago,
  crearTipoPago,
  eliminarTipoPago,
  listarTiposPago,
  marcarTipoPagoDefault,
} from '@/api/tiposPago';
import { getCatalogoFormPago } from '@/api/pagos';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_CATALOGS, STALE_LISTS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { TipoPago, TipoPagoInput } from '@/types';

const PAGE_SIZE = 20;

interface FormState {
  nombre: string;
  descripcion: string;
  orden: string;
  activo: boolean;
}

const empty: FormState = { nombre: '', descripcion: '', orden: '0', activo: true };

export default function TiposPagoTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<TipoPago | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [formError, setFormError] = useState<string | null>(null);
  const [eliminarTarget, setEliminarTarget] = useState<TipoPago | null>(null);

  const catalogo = useQuery({
    queryKey: queryKeys.catalogoFormPago(),
    queryFn: getCatalogoFormPago,
    staleTime: STALE_CATALOGS,
  });
  const defaultId = catalogo.data?.defaults.tipoPagoId ?? null;

  const params = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, search: debounced || undefined }),
    [page, debounced],
  );

  const query = useQuery({
    queryKey: queryKeys.tiposPago(params),
    queryFn: () => listarTiposPago(params),
    staleTime: STALE_LISTS,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['tipos-pago'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.catalogoFormPago() });
  };

  const guardar = useMutation({
    mutationFn: () => {
      const payload: TipoPagoInput = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        activo: form.activo,
        orden: form.orden === '' ? undefined : Number(form.orden),
      };
      return editando ? actualizarTipoPago(editando.id, payload) : crearTipoPago(payload);
    },
    onSuccess: () => {
      toast.success(editando ? 'Tipo de pago actualizado' : 'Tipo de pago creado');
      setDialogOpen(false);
      invalidar();
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => eliminarTipoPago(id),
    onSuccess: () => {
      toast.success('Tipo de pago desactivado');
      setEliminarTarget(null);
      invalidar();
    },
    onError: (error) => toast.error('No se pudo desactivar', getApiErrorMessage(error)),
  });

  const marcarDefault = useMutation({
    mutationFn: (id: number) => marcarTipoPagoDefault(id),
    onSuccess: () => {
      toast.success('Tipo de pago predeterminado actualizado');
      invalidar();
    },
    onError: (error) => toast.error('No se pudo actualizar', getApiErrorMessage(error)),
  });

  const ordenValido = form.orden === '' || /^\d+$/.test(form.orden);

  const columns = useMemo<ColumnDef<TipoPago, unknown>[]>(
    () => [
      {
        accessorKey: 'nombre',
        header: 'Nombre',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.nombre}</span>
            {defaultId === row.original.id && <Badge variant="default">Predeterminado</Badge>}
          </div>
        ),
      },
      {
        accessorKey: 'descripcion',
        header: 'Descripción',
        cell: ({ row }) => row.original.descripcion ?? '—',
      },
      {
        accessorKey: 'orden',
        header: 'Orden',
        cell: ({ row }) => <span className="tabular-nums">{row.original.orden}</span>,
      },
      {
        accessorKey: 'activo',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>,
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {tiene('tipos_pago.gestionar') && row.original.activo && defaultId !== row.original.id && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Marcar como predeterminado"
                title="Marcar como predeterminado"
                disabled={marcarDefault.isPending}
                onClick={() => marcarDefault.mutate(row.original.id)}
              >
                <Star className="h-4 w-4" />
              </Button>
            )}
            {tiene('tipos_pago.gestionar') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar"
                onClick={() => {
                  setEditando(row.original);
                  setForm({
                    nombre: row.original.nombre,
                    descripcion: row.original.descripcion ?? '',
                    orden: String(row.original.orden),
                    activo: row.original.activo,
                  });
                  setFormError(null);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {tiene('tipos_pago.gestionar') && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Desactivar"
                onClick={() => setEliminarTarget(row.original)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [tiene, defaultId, marcarDefault.isPending],
  );

  return (
    <div>
      <PageHeader
        title="Tipos de pago"
        description="Catálogo de formas de pago disponibles al registrar cobros."
        actions={
          tiene('tipos_pago.gestionar') ? (
            <Button
              onClick={() => {
                setEditando(null);
                setForm(empty);
                setFormError(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nuevo tipo de pago
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex max-w-sm items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tp-search">Buscar</Label>
          <Input
            id="tp-search"
            placeholder="Nombre o descripción"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <ClearFiltersButton
          current={{ search }}
          initial={{ search: '' }}
          onClear={() => {
            setSearch('');
            setPage(1);
          }}
        />
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
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium">{row.nombre}</span>
                  {defaultId === row.id && <Badge variant="default">Predeterminado</Badge>}
                </div>
                {row.activo ? (
                  <Badge variant="success">Activo</Badge>
                ) : (
                  <Badge variant="secondary">Inactivo</Badge>
                )}
              </div>
              {row.descripcion && (
                <p className="text-xs text-muted-foreground">{row.descripcion}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Orden: <span className="tabular-nums">{row.orden}</span>
              </p>
              {tiene('tipos_pago.gestionar') && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {row.activo && defaultId !== row.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={marcarDefault.isPending}
                      onClick={() => marcarDefault.mutate(row.id)}
                    >
                      <Star className="h-4 w-4" />
                      Predeterminado
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditando(row);
                      setForm({
                        nombre: row.nombre,
                        descripcion: row.descripcion ?? '',
                        orden: String(row.orden),
                        activo: row.activo,
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
                    Desactivar
                  </Button>
                </div>
              )}
            </div>
          )}
          emptyTitle="Sin tipos de pago"
          emptyDescription="No hay tipos de pago que coincidan con los filtros."
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
        title={editando ? 'Editar tipo de pago' : 'Nuevo tipo de pago'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!form.nombre.trim() || !ordenValido}
              loading={guardar.isPending}
              onClick={() => {
                setFormError(null);
                guardar.mutate();
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tp-nombre">Nombre *</Label>
            <Input
              id="tp-nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tp-desc">Descripción</Label>
            <Input
              id="tp-desc"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tp-orden">Orden</Label>
            <Input
              id="tp-orden"
              inputMode="numeric"
              value={form.orden}
              onChange={(e) => setForm({ ...form, orden: e.target.value })}
            />
            {!ordenValido && (
              <p className="text-xs text-destructive">Use un número entero mayor o igual a 0.</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            />
            Tipo de pago activo
          </label>
          {formError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={eliminarTarget !== null}
        onClose={() => setEliminarTarget(null)}
        onConfirm={() => eliminarTarget && eliminar.mutate(eliminarTarget.id)}
        title="Desactivar tipo de pago"
        description="El tipo de pago dejará de estar disponible para nuevos registros. ¿Desea continuar?"
        confirmLabel="Desactivar"
        destructive
        loading={eliminar.isPending}
      />
    </div>
  );
}
