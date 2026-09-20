import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Power, Plus, Star } from 'lucide-react';
import {
  actualizarCuenta,
  crearCuenta,
  desactivarCuenta,
  listarCuentas,
  marcarCuentaDefault,
  type CuentaInput,
} from '@/api/cuentas';
import { listarBancos } from '@/api/bancos';
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
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { CuentaRecaudadora } from '@/types';

const PAGE_SIZE = 20;

interface FormState {
  bancoId: string;
  numeroCuenta: string;
  alias: string;
  activo: boolean;
}

const empty: FormState = { bancoId: '', numeroCuenta: '', alias: '', activo: true };

export default function CuentasTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [bancoId, setBancoId] = useState('');
  const [activo, setActivo] = useState('');
  const debounced = useDebounce(search, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<CuentaRecaudadora | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [formError, setFormError] = useState<string | null>(null);
  const [desactivar, setDesactivar] = useState<CuentaRecaudadora | null>(null);

  const bancosQuery = useQuery({
    queryKey: queryKeys.bancos({ pageSize: 200 }),
    queryFn: () => listarBancos({ pageSize: 200 }),
    staleTime: STALE_CATALOGS,
  });

  const catalogo = useQuery({
    queryKey: queryKeys.catalogoFormPago(),
    queryFn: getCatalogoFormPago,
    staleTime: STALE_CATALOGS,
  });
  const defaultId = catalogo.data?.defaults.cuentaRecaudadoraId ?? null;

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: debounced || undefined,
      bancoId: bancoId || undefined,
      activo: activo || undefined,
    }),
    [page, debounced, bancoId, activo],
  );

  const query = useQuery({
    queryKey: queryKeys.cuentas(params),
    queryFn: () => listarCuentas(params),
    staleTime: STALE_LISTS,
  });

  const guardar = useMutation({
    mutationFn: () => {
      const payload: CuentaInput = {
        bancoId: Number(form.bancoId),
        numeroCuenta: form.numeroCuenta.trim(),
        alias: form.alias.trim() || null,
        activo: form.activo,
      };
      return editando ? actualizarCuenta(editando.id, payload) : crearCuenta(payload);
    },
    onSuccess: () => {
      toast.success(editando ? 'Cuenta actualizada' : 'Cuenta creada');
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['cuentas'] });
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const baja = useMutation({
    mutationFn: (id: number) => desactivarCuenta(id),
    onSuccess: () => {
      toast.success('Cuenta desactivada');
      setDesactivar(null);
      queryClient.invalidateQueries({ queryKey: ['cuentas'] });
    },
    onError: (error) => toast.error('No se pudo desactivar', getApiErrorMessage(error)),
  });

  const marcarDefault = useMutation({
    mutationFn: (id: number) => marcarCuentaDefault(id),
    onSuccess: () => {
      toast.success('Cuenta predeterminada actualizada');
      queryClient.invalidateQueries({ queryKey: ['cuentas'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.catalogoFormPago() });
    },
    onError: (error) => toast.error('No se pudo actualizar', getApiErrorMessage(error)),
  });

  const columns = useMemo<ColumnDef<CuentaRecaudadora, unknown>[]>(
    () => [
      {
        accessorKey: 'numeroCuenta',
        header: 'Número de cuenta',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums">{row.original.numeroCuenta}</span>
            {defaultId === row.original.id && <Badge variant="default">Predeterminada</Badge>}
          </div>
        ),
      },
      { accessorKey: 'alias', header: 'Alias', cell: ({ row }) => row.original.alias ?? '—' },
      { id: 'banco', header: 'Banco', cell: ({ row }) => row.original.banco.nombre },
      {
        accessorKey: 'activo',
        header: 'Estado',
        cell: ({ row }) =>
          row.original.activo ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>,
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {tiene('cuentas.gestionar') && row.original.activo && defaultId !== row.original.id && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Marcar como predeterminada"
                title="Marcar como predeterminada"
                disabled={marcarDefault.isPending}
                onClick={() => marcarDefault.mutate(row.original.id)}
              >
                <Star className="h-4 w-4" />
              </Button>
            )}
            {tiene('cuentas.gestionar') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar"
                onClick={() => {
                  setEditando(row.original);
                  setForm({
                    bancoId: String(row.original.bancoId ?? row.original.banco.id),
                    numeroCuenta: row.original.numeroCuenta,
                    alias: row.original.alias ?? '',
                    activo: row.original.activo ?? true,
                  });
                  setFormError(null);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {tiene('cuentas.gestionar') && row.original.activo && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Desactivar"
                onClick={() => setDesactivar(row.original)}
              >
                <Power className="h-4 w-4" />
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
        title="Cuentas recaudadoras"
        description="Cuentas bancarias donde ingresan los pagos."
        actions={
          tiene('cuentas.gestionar') ? (
            <Button
              onClick={() => {
                setEditando(null);
                setForm(empty);
                setFormError(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nueva cuenta
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="q-search">Buscar</Label>
          <Input id="q-search" placeholder="Número o alias" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-banco">Banco</Label>
          <Select id="q-banco" value={bancoId} onChange={(e) => { setBancoId(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {bancosQuery.data?.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-activo">Estado</Label>
          <Select id="q-activo" value={activo} onChange={(e) => { setActivo(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            <option value="true">Activas</option>
            <option value="false">Inactivas</option>
          </Select>
        </div>
        <div className="flex items-end">
          <ClearFiltersButton
            current={{ search, bancoId, activo }}
            initial={{ search: '', bancoId: '', activo: '' }}
            onClear={() => {
              setSearch('');
              setBancoId('');
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
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">{row.numeroCuenta}</span>
                  {defaultId === row.id && <Badge variant="default">Predeterminada</Badge>}
                </div>
                {row.activo ? (
                  <Badge variant="success">Activa</Badge>
                ) : (
                  <Badge variant="secondary">Inactiva</Badge>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Banco</dt>
                  <dd className="truncate">{row.banco.nombre}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Alias</dt>
                  <dd className="truncate">{row.alias ?? '—'}</dd>
                </div>
              </dl>
              {tiene('cuentas.gestionar') && (
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {row.activo && defaultId !== row.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={marcarDefault.isPending}
                      onClick={() => marcarDefault.mutate(row.id)}
                    >
                      <Star className="h-4 w-4" />
                      Predeterminada
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditando(row);
                      setForm({
                        bancoId: String(row.bancoId ?? row.banco.id),
                        numeroCuenta: row.numeroCuenta,
                        alias: row.alias ?? '',
                        activo: row.activo ?? true,
                      });
                      setFormError(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  {row.activo && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDesactivar(row)}
                    >
                      <Power className="h-4 w-4" />
                      Desactivar
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          emptyTitle="Sin cuentas recaudadoras"
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
        title={editando ? 'Editar cuenta recaudadora' : 'Nueva cuenta recaudadora'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!form.bancoId || !form.numeroCuenta.trim()} loading={guardar.isPending} onClick={() => { setFormError(null); guardar.mutate(); }}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="q-form-banco">Banco *</Label>
            <Select id="q-form-banco" value={form.bancoId} onChange={(e) => setForm({ ...form, bancoId: e.target.value })}>
              <option value="">Seleccione…</option>
              {bancosQuery.data?.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-numero">Número de cuenta *</Label>
            <Input id="q-numero" value={form.numeroCuenta} onChange={(e) => setForm({ ...form, numeroCuenta: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-alias">Alias</Label>
            <Input id="q-alias" value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Cuenta activa
          </label>
          {formError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
        </div>
      </Dialog>

      <ConfirmDialog
        open={desactivar !== null}
        onClose={() => setDesactivar(null)}
        onConfirm={() => desactivar && baja.mutate(desactivar.id)}
        title="Desactivar cuenta"
        description="La cuenta no estará disponible para reportar pagos. ¿Desea continuar?"
        confirmLabel="Desactivar"
        destructive
        loading={baja.isPending}
      />
    </div>
  );
}
