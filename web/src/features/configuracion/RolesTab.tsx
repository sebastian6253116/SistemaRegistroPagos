import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  actualizarRol,
  crearRol,
  eliminarRol,
  getCatalogoPermisos,
  listarRoles,
  type RolInput,
} from '@/api/roles';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_CATALOGS, STALE_LISTS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ErrorState } from '@/components/common/ErrorState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { LoadingState } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import type { Rol } from '@/types';

const PAGE_SIZE = 20;

const MODULO_LABELS: Record<string, string> = {
  usuarios: 'Usuarios',
  roles: 'Roles y permisos',
  cobradores: 'Cobradores',
  bancos: 'Bancos',
  cuentas: 'Cuentas recaudadoras',
  tasas: 'Tasas de referencia',
  pagos: 'Pagos reportados',
  movimientos: 'Movimientos bancarios',
  gastos: 'Gastos',
  dashboard: 'Dashboard',
  reportes: 'Reportes',
  auditoria: 'Auditoría',
  config: 'Configuración',
};

export default function RolesTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Rol | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [eliminarTarget, setEliminarTarget] = useState<Rol | null>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.roles({ page, pageSize: PAGE_SIZE }),
    queryFn: () => listarRoles({ page, pageSize: PAGE_SIZE }),
    staleTime: STALE_LISTS,
  });

  const permisosQuery = useQuery({
    queryKey: queryKeys.permisosCatalogo(),
    queryFn: getCatalogoPermisos,
    staleTime: STALE_CATALOGS,
  });

  const guardar = useMutation({
    mutationFn: () => {
      const payload: RolInput = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        permisos: [...seleccion],
      };
      return editando ? actualizarRol(editando.id, payload) : crearRol(payload);
    },
    onSuccess: () => {
      toast.success(editando ? 'Rol actualizado' : 'Rol creado');
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => eliminarRol(id),
    onSuccess: () => {
      toast.success('Rol eliminado');
      setEliminarTarget(null);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (error) => toast.error('No se pudo eliminar', getApiErrorMessage(error)),
  });

  function toggle(clave: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }

  function abrirCrear() {
    setEditando(null);
    setNombre('');
    setDescripcion('');
    setSeleccion(new Set());
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEditar(rol: Rol) {
    setEditando(rol);
    setNombre(rol.nombre);
    setDescripcion(rol.descripcion ?? '');
    setSeleccion(new Set(rol.permisos));
    setFormError(null);
    setDialogOpen(true);
  }

  const columns = useMemo<ColumnDef<Rol, unknown>[]>(
    () => [
      { accessorKey: 'nombre', header: 'Rol' },
      { accessorKey: 'descripcion', header: 'Descripción', cell: ({ row }) => row.original.descripcion ?? '—' },
      {
        id: 'usuarios',
        header: 'Usuarios',
        cell: ({ row }) => <Badge variant="secondary">{row.original.usuarioCount}</Badge>,
      },
      {
        id: 'permisos',
        header: 'Permisos',
        cell: ({ row }) => <Badge variant="outline">{row.original.permisos.length}</Badge>,
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {tiene('roles.gestionar') && (
              <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => abrirEditar(row.original)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {tiene('roles.gestionar') && (
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
        title="Roles y permisos"
        description="Defina roles y asigne permisos granulares por módulo."
        actions={
          tiene('roles.gestionar') ? (
            <Button onClick={abrirCrear}>
              <Plus className="h-4 w-4" />
              Nuevo rol
            </Button>
          ) : null
        }
      />

      {listQuery.isError ? (
        <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={listQuery.data?.data ?? []}
          isLoading={listQuery.isLoading}
          getRowId={(r) => String(r.id)}
          mobileCard={(row) => (
            <div className="space-y-2">
              <p className="font-medium">{row.nombre}</p>
              {row.descripcion && (
                <p className="text-xs text-muted-foreground">{row.descripcion}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  Usuarios <Badge variant="secondary">{row.usuarioCount}</Badge>
                </span>
                <span className="inline-flex items-center gap-1">
                  Permisos <Badge variant="outline">{row.permisos.length}</Badge>
                </span>
              </div>
              {tiene('roles.gestionar') && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <Button variant="outline" size="sm" onClick={() => abrirEditar(row)}>
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
          emptyTitle="Sin roles"
          pagination={
            listQuery.data
              ? {
                  page: listQuery.data.meta.page,
                  pageSize: listQuery.data.meta.pageSize,
                  total: listQuery.data.meta.total,
                  totalPages: listQuery.data.meta.totalPages,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editando ? 'Editar rol' : 'Nuevo rol'}
        description="Marque los permisos que otorga este rol."
        className="sm:max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!nombre.trim()} loading={guardar.isPending} onClick={() => { setFormError(null); guardar.mutate(); }}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rol-nombre">Nombre *</Label>
              <Input id="rol-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rol-desc">Descripción</Label>
              <Input id="rol-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </div>

          {permisosQuery.isLoading ? (
            <LoadingState label="Cargando permisos…" />
          ) : (
            <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-md border p-4">
              {permisosQuery.data?.map((grupo) => (
                <div key={grupo.modulo}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {MODULO_LABELS[grupo.modulo] ?? grupo.modulo}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {grupo.permisos.map((p) => (
                      <label key={p.clave} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={seleccion.has(p.clave)}
                          onChange={() => toggle(p.clave)}
                        />
                        <span>
                          {p.descripcion ?? p.clave}
                          <span className="block text-xs text-muted-foreground">{p.clave}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">{seleccion.size} permiso(s) seleccionado(s).</p>
          {formError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
        </div>
      </Dialog>

      <ConfirmDialog
        open={eliminarTarget !== null}
        onClose={() => setEliminarTarget(null)}
        onConfirm={() => eliminarTarget && eliminar.mutate(eliminarTarget.id)}
        title="Eliminar rol"
        description="Solo se pueden eliminar roles sin usuarios asignados. ¿Desea continuar?"
        confirmLabel="Eliminar"
        destructive
        loading={eliminar.isPending}
      />
    </div>
  );
}
