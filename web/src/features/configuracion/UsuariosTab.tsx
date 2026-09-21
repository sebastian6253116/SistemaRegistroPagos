import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2, UserX } from 'lucide-react';
import {
  actualizarUsuario,
  crearUsuario,
  desactivarUsuario,
  eliminarUsuarioDefinitivo,
  listarUsuarios,
  type UsuarioInput,
} from '@/api/usuarios';
import { listarRoles } from '@/api/roles';
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
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { Usuario } from '@/types';

const PAGE_SIZE = 20;

interface FormState {
  nombreCompleto: string;
  usuario: string;
  email: string;
  password: string;
  rolId: string;
  activo: boolean;
}

const empty: FormState = { nombreCompleto: '', usuario: '', email: '', password: '', rolId: '', activo: true };

export default function UsuariosTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [rolId, setRolId] = useState('');
  const [activo, setActivo] = useState('');
  const debounced = useDebounce(search, 300);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [formError, setFormError] = useState<string | null>(null);
  const [desactivar, setDesactivar] = useState<Usuario | null>(null);
  const [definitivo, setDefinitivo] = useState<Usuario | null>(null);

  const rolesQuery = useQuery({
    queryKey: queryKeys.roles({ pageSize: 200 }),
    queryFn: () => listarRoles({ pageSize: 200 }),
    staleTime: STALE_CATALOGS,
  });

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: debounced || undefined,
      rolId: rolId || undefined,
      activo: activo || undefined,
    }),
    [page, debounced, rolId, activo],
  );

  const query = useQuery({
    queryKey: queryKeys.usuarios(params),
    queryFn: () => listarUsuarios(params),
    staleTime: STALE_LISTS,
  });

  const guardar = useMutation({
    mutationFn: () => {
      const payload: UsuarioInput = {
        nombreCompleto: form.nombreCompleto,
        usuario: form.usuario,
        email: form.email,
        rolId: Number(form.rolId),
        activo: form.activo,
      };
      if (form.password) payload.password = form.password;
      if (editando) return actualizarUsuario(editando.id, payload);
      return crearUsuario(payload);
    },
    onSuccess: () => {
      toast.success(editando ? 'Usuario actualizado' : 'Usuario creado');
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const baja = useMutation({
    mutationFn: (id: number) => desactivarUsuario(id),
    onSuccess: () => {
      toast.success('Usuario desactivado');
      setDesactivar(null);
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (error) => toast.error('No se pudo desactivar', getApiErrorMessage(error)),
  });

  const eliminarDefinitivo = useMutation({
    mutationFn: (id: number) => eliminarUsuarioDefinitivo(id),
    onSuccess: () => {
      toast.success('Usuario eliminado');
      setDefinitivo(null);
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (error) => toast.error('No se pudo eliminar el usuario', getApiErrorMessage(error)),
  });

  const columns = useMemo<ColumnDef<Usuario, unknown>[]>(
    () => [
      { accessorKey: 'nombreCompleto', header: 'Nombre' },
      { accessorKey: 'usuario', header: 'Usuario' },
      { accessorKey: 'email', header: 'Correo' },
      { id: 'rol', header: 'Rol', cell: ({ row }) => row.original.rol.nombre },
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
            {tiene('usuarios.editar') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar"
                onClick={() => {
                  setEditando(row.original);
                  setForm({
                    nombreCompleto: row.original.nombreCompleto,
                    usuario: row.original.usuario,
                    email: row.original.email,
                    password: '',
                    rolId: String(row.original.rolId),
                    activo: row.original.activo,
                  });
                  setFormError(null);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {tiene('usuarios.eliminar') && row.original.activo && (
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
            {tiene('usuarios.eliminar_definitivo') && (
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

  const formValido =
    form.nombreCompleto.trim() &&
    form.usuario.trim() &&
    form.email.trim() &&
    form.rolId &&
    (editando || form.password.length >= 8) &&
    (form.password === '' || form.password.length >= 8);

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Gestión de cuentas y roles del sistema."
        actions={
          tiene('usuarios.crear') ? (
            <Button
              onClick={() => {
                setEditando(null);
                setForm(empty);
                setFormError(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="u-search">Buscar</Label>
          <Input id="u-search" placeholder="Nombre, usuario o correo" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-rol">Rol</Label>
          <Select id="u-rol" value={rolId} onChange={(e) => { setRolId(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {rolesQuery.data?.data.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-activo">Estado</Label>
          <Select id="u-activo" value={activo} onChange={(e) => { setActivo(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </Select>
        </div>
        <div className="flex items-end">
          <ClearFiltersButton
            current={{ search, rolId, activo }}
            initial={{ search: '', rolId: '', activo: '' }}
            onClear={() => {
              setSearch('');
              setRolId('');
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
                  <p className="truncate font-medium">{row.nombreCompleto}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.usuario}</p>
                </div>
                {row.activo ? (
                  <Badge variant="success">Activo</Badge>
                ) : (
                  <Badge variant="secondary">Inactivo</Badge>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Correo</dt>
                  <dd className="truncate">{row.email}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rol</dt>
                  <dd className="truncate">{row.rol.nombre}</dd>
                </div>
              </dl>
              {(tiene('usuarios.editar') || (tiene('usuarios.eliminar') && row.activo) || tiene('usuarios.eliminar_definitivo')) && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {tiene('usuarios.editar') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditando(row);
                        setForm({
                          nombreCompleto: row.nombreCompleto,
                          usuario: row.usuario,
                          email: row.email,
                          password: '',
                          rolId: String(row.rolId),
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
                  {tiene('usuarios.eliminar') && row.activo && (
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
                  {tiene('usuarios.eliminar_definitivo') && (
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
          emptyTitle="Sin usuarios"
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
        title={editando ? 'Editar usuario' : 'Nuevo usuario'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!formValido} loading={guardar.isPending} onClick={() => { setFormError(null); guardar.mutate(); }}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre completo *</Label>
            <Input id="nombre" value={form.nombreCompleto} onChange={(e) => setForm({ ...form, nombreCompleto: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="usuario">Usuario *</Label>
              <Input id="usuario" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo *</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="password">{editando ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</Label>
              <PasswordInput id="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rolId">Rol *</Label>
              <Select id="rolId" value={form.rolId} onChange={(e) => setForm({ ...form, rolId: e.target.value })}>
                <option value="">Seleccione…</option>
                {rolesQuery.data?.data.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Usuario activo
          </label>
          {formError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
        </div>
      </Dialog>

      <ConfirmDialog
        open={desactivar !== null}
        onClose={() => setDesactivar(null)}
        onConfirm={() => desactivar && baja.mutate(desactivar.id)}
        title="Desactivar usuario"
        description="El usuario no podrá iniciar sesión. ¿Desea continuar?"
        confirmLabel="Desactivar"
        destructive
        loading={baja.isPending}
      />

      <ConfirmDialog
        open={definitivo !== null}
        onClose={() => setDefinitivo(null)}
        onConfirm={() => definitivo && eliminarDefinitivo.mutate(definitivo.id)}
        title="Eliminar usuario definitivamente"
        description="Esta acción es IRREVERSIBLE y eliminará el usuario de forma permanente. Se rechazará si el usuario tiene historial asociado (gastos, conciliaciones, lotes, pagos validados o un cobrador vinculado con pagos). El registro de auditoría se conserva, solo pierde la referencia al usuario. ¿Desea continuar?"
        confirmLabel="Eliminar definitivamente"
        destructive
        loading={eliminarDefinitivo.isPending}
      />
    </div>
  );
}
