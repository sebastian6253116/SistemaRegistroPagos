import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { actualizarBanco, crearBanco, eliminarBanco, listarBancos, type BancoInput } from '@/api/bancos';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_LISTS } from '@/lib/queryClient';
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
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { Banco } from '@/types';

const PAGE_SIZE = 20;

export default function BancosTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Banco | null>(null);
  const [form, setForm] = useState({ nombre: '', codigo: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [eliminarTarget, setEliminarTarget] = useState<Banco | null>(null);

  const query = useQuery({
    queryKey: queryKeys.bancos({ page, pageSize: PAGE_SIZE, search: debounced || undefined }),
    queryFn: () => listarBancos({ page, pageSize: PAGE_SIZE, search: debounced || undefined }),
    staleTime: STALE_LISTS,
  });

  const guardar = useMutation({
    mutationFn: () => {
      const payload: BancoInput = { nombre: form.nombre.trim(), codigo: form.codigo.trim() };
      return editando ? actualizarBanco(editando.id, payload) : crearBanco(payload);
    },
    onSuccess: () => {
      toast.success(editando ? 'Banco actualizado' : 'Banco creado');
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['bancos'] });
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => eliminarBanco(id),
    onSuccess: () => {
      toast.success('Banco eliminado');
      setEliminarTarget(null);
      queryClient.invalidateQueries({ queryKey: ['bancos'] });
    },
    onError: (error) => toast.error('No se pudo eliminar', getApiErrorMessage(error)),
  });

  const columns = useMemo<ColumnDef<Banco, unknown>[]>(
    () => [
      { accessorKey: 'codigo', header: 'Código' },
      { accessorKey: 'nombre', header: 'Nombre' },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {tiene('bancos.gestionar') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar"
                onClick={() => {
                  setEditando(row.original);
                  setForm({ nombre: row.original.nombre, codigo: row.original.codigo });
                  setFormError(null);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {tiene('bancos.gestionar') && (
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
        title="Bancos"
        description="Catálogo de bancos de origen."
        actions={
          tiene('bancos.gestionar') ? (
            <Button
              onClick={() => {
                setEditando(null);
                setForm({ nombre: '', codigo: '' });
                setFormError(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nuevo banco
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex max-w-sm items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="b-search">Buscar</Label>
          <Input id="b-search" placeholder="Nombre o código" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
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
              <div className="min-w-0">
                <p className="truncate font-medium">{row.nombre}</p>
                <p className="text-xs text-muted-foreground">Código {row.codigo}</p>
              </div>
              {tiene('bancos.gestionar') && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditando(row);
                      setForm({ nombre: row.nombre, codigo: row.codigo });
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
          emptyTitle="Sin bancos"
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
        title={editando ? 'Editar banco' : 'Nuevo banco'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!form.nombre.trim() || !form.codigo.trim()} loading={guardar.isPending} onClick={() => { setFormError(null); guardar.mutate(); }}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="b-codigo">Código *</Label>
            <Input id="b-codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-nombre">Nombre *</Label>
            <Input id="b-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          {formError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
        </div>
      </Dialog>

      <ConfirmDialog
        open={eliminarTarget !== null}
        onClose={() => setEliminarTarget(null)}
        onConfirm={() => eliminarTarget && eliminar.mutate(eliminarTarget.id)}
        title="Eliminar banco"
        description="Solo se pueden eliminar bancos sin cuentas ni pagos asociados. ¿Desea continuar?"
        confirmLabel="Eliminar"
        destructive
        loading={eliminar.isPending}
      />
    </div>
  );
}
