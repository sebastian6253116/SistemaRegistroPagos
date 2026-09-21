import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2, UserX } from 'lucide-react';
import {
  actualizarCobrador,
  crearCobrador,
  desactivarCobrador,
  eliminarCobradorDefinitivo,
  listarCobradores,
  type CobradorInput,
} from '@/api/cobradores';
import { listarUsuarios } from '@/api/usuarios';
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
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { Cobrador } from '@/types';

const PAGE_SIZE = 20;

interface FormState {
  nombre: string;
  codigo: string;
  usuarioId: string;
  activo: boolean;
}

const empty: FormState = { nombre: '', codigo: '', usuarioId: '', activo: true };

export default function CobradoresTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activo, setActivo] = useState('');
  const debounced = useDebounce(search, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Cobrador | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [formError, setFormError] = useState<string | null>(null);
  const [desactivar, setDesactivar] = useState<Cobrador | null>(null);
  const [definitivo, setDefinitivo] = useState<Cobrador | null>(null);

  const usuariosQuery = useQuery({
    queryKey: queryKeys.usuarios({ pageSize: 200 }),
    queryFn: () => listarUsuarios({ pageSize: 200 }),
    staleTime: STALE_CATALOGS,
    enabled: tiene('usuarios.ver'),
  });

  const params = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, search: debounced || undefined, activo: activo || undefined }),
    [page, debounced, activo],
  );

  const query = useQuery({
    queryKey: queryKeys.cobradores(params),
    queryFn: () => listarCobradores(params),
    staleTime: STALE_LISTS,
  });

  const guardar = useMutation({
    mutationFn: () => {
      const payload: CobradorInput = {
        nombre: form.nombre.trim(),
        codigo: form.codigo.trim(),
        usuarioId: form.usuarioId ? Number(form.usuarioId) : null,
        activo: form.activo,
      };
      return editando ? actualizarCobrador(editando.id, payload) : crearCobrador(payload);
    },
    onSuccess: () => {
      toast.success(editando ? 'Cobrador actualizado' : 'Cobrador creado');
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['cobradores'] });
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const baja = useMutation({
    mutationFn: (id: number) => desactivarCobrador(id),
    onSuccess: () => {
      toast.success('Cobrador desactivado');
      setDesactivar(null);
      queryClient.invalidateQueries({ queryKey: ['cobradores'] });
    },
    onError: (error) => toast.error('No se pudo desactivar', getApiErrorMessage(error)),
  });

  const eliminarDefinitivo = useMutation({
    mutationFn: (id: number) => eliminarCobradorDefinitivo(id),
    onSuccess: () => {
      toast.success('Cobrador eliminado');
      setDefinitivo(null);
      queryClient.invalidateQueries({ queryKey: ['cobradores'] });
    },
    onError: (error) => toast.error('No se pudo eliminar el cobrador', getApiErrorMessage(error)),
  });

  const columns = useMemo<ColumnDef<Cobrador, unknown>[]>(
    () => [
      { accessorKey: 'nombre', header: 'Nombre' },
      { accessorKey: 'codigo', header: 'Código' },
      {
        id: 'usuario',
        header: 'Usuario vinculado',
        cell: ({ row }) => row.original.usuario?.usuario ?? <span className="text-muted-foreground">—</span>,
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
            {tiene('cobradores.gestionar') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar"
                onClick={() => {
                  setEditando(row.original);
                  setForm({
                    nombre: row.original.nombre,
                    codigo: row.original.codigo,
                    usuarioId: row.original.usuarioId ? String(row.original.usuarioId) : '',
                    activo: row.original.activo,
                  });
                  setFormError(null);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {tiene('cobradores.gestionar') && row.original.activo && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Desactivar"
                onClick={() => setDesactivar(row.original)}
              >
                <UserX className="h-4 w-4" />
              </Button>
            )}
            {tiene('cobradores.eliminar_definitivo') && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Eliminar definitivamente"
                onClick={() => setDefinitivo(row.original)}
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
        title="Cobradores"
        description="Personas que reportan pagos."
        actions={
          tiene('cobradores.gestionar') ? (
            <Button
              onClick={() => {
                setEditando(null);
                setForm(empty);
                setFormError(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nuevo cobrador
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-search">Buscar</Label>
          <Input id="c-search" placeholder="Nombre o código" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-activo">Estado</Label>
          <Select id="c-activo" value={activo} onChange={(e) => { setActivo(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </Select>
        </div>
        <div className="flex items-end">
          <ClearFiltersButton
            current={{ search, activo }}
            initial={{ search: '', activo: '' }}
            onClear={() => {
              setSearch('');
              setActivo('');
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
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">Código {row.codigo}</p>
                </div>
                {row.activo ? (
                  <Badge variant="success">Activo</Badge>
                ) : (
                  <Badge variant="secondary">Inactivo</Badge>
                )}
              </div>
              <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
                <div>
                  <dt className="text-muted-foreground">Usuario vinculado</dt>
                  <dd className="truncate">
                    {row.usuario?.usuario ?? <span className="text-muted-foreground">—</span>}
                  </dd>
                </div>
              </dl>
              {(tiene('cobradores.gestionar') || tiene('cobradores.eliminar_definitivo')) && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {tiene('cobradores.gestionar') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditando(row);
                        setForm({
                          nombre: row.nombre,
                          codigo: row.codigo,
                          usuarioId: row.usuarioId ? String(row.usuarioId) : '',
                          activo: row.activo,
                        });
                        setFormError(null);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  )}
                  {tiene('cobradores.gestionar') && row.activo && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDesactivar(row)}
                    >
                      <UserX className="h-4 w-4" />
                      Desactivar
                    </Button>
                  )}
                  {tiene('cobradores.eliminar_definitivo') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDefinitivo(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar definitivamente
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          emptyTitle="Sin cobradores"
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
        title={editando ? 'Editar cobrador' : 'Nuevo cobrador'}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-nombre">Nombre *</Label>
              <Input id="c-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-codigo">Código *</Label>
              <Input id="c-codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </div>
          </div>
          {tiene('usuarios.ver') && (
            <div className="space-y-1.5">
              <Label htmlFor="c-usuario">Usuario vinculado</Label>
              <Select id="c-usuario" value={form.usuarioId} onChange={(e) => setForm({ ...form, usuarioId: e.target.value })}>
                <option value="">Sin vincular</option>
                {usuariosQuery.data?.data.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombreCompleto} ({u.usuario})
                  </option>
                ))}
              </Select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Cobrador activo
          </label>
          {formError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
        </div>
      </Dialog>

      <ConfirmDialog
        open={desactivar !== null}
        onClose={() => setDesactivar(null)}
        onConfirm={() => desactivar && baja.mutate(desactivar.id)}
        title="Desactivar cobrador"
        description="El cobrador no podrá reportar nuevos pagos. ¿Desea continuar?"
        confirmLabel="Desactivar"
        destructive
        loading={baja.isPending}
      />

      <ConfirmDialog
        open={definitivo !== null}
        onClose={() => setDefinitivo(null)}
        onConfirm={() => definitivo && eliminarDefinitivo.mutate(definitivo.id)}
        title="Eliminar cobrador definitivamente"
        description="Esta acción es IRREVERSIBLE y eliminará el cobrador de forma permanente. Se rechazará si el cobrador tiene pagos reportados. ¿Desea continuar?"
        confirmLabel="Eliminar definitivamente"
        destructive
        loading={eliminarDefinitivo.isPending}
      />
    </div>
  );
}
