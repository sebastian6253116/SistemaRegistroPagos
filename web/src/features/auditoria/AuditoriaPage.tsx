import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { listarAuditoria } from '@/api/auditoria';
import { listarUsuarios } from '@/api/usuarios';
import { queryKeys, STALE_CATALOGS, STALE_LISTS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HistorialBcvTab from './HistorialBcvTab';
import type { AuditoriaItem } from '@/types';

const PAGE_SIZE = 25;

const ACCIONES = ['crear', 'editar', 'borrar', 'validar', 'rechazar', 'login', 'importar'];

const ACCION_VARIANT: Record<string, 'default' | 'success' | 'destructive' | 'warning' | 'secondary'> = {
  crear: 'success',
  editar: 'default',
  borrar: 'destructive',
  validar: 'success',
  rechazar: 'warning',
  login: 'secondary',
  importar: 'default',
};

export default function AuditoriaPage() {
  const { tiene } = usePermiso();
  const [tab, setTab] = useState('registro');
  const [page, setPage] = useState(1);
  const [usuarioId, setUsuarioId] = useState('');
  const [entidad, setEntidad] = useState('');
  const [accion, setAccion] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const debouncedEntidad = useDebounce(entidad, 300);
  const [detalle, setDetalle] = useState<AuditoriaItem | null>(null);

  const usuariosQuery = useQuery({
    queryKey: queryKeys.usuarios({ pageSize: 200 }),
    queryFn: () => listarUsuarios({ pageSize: 200 }),
    staleTime: STALE_CATALOGS,
    enabled: tiene('usuarios.ver'),
  });

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      usuarioId: usuarioId || undefined,
      entidad: debouncedEntidad || undefined,
      accion: accion || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    }),
    [page, usuarioId, debouncedEntidad, accion, fechaDesde, fechaHasta],
  );

  const query = useQuery({
    queryKey: queryKeys.auditoria(params),
    queryFn: () => listarAuditoria(params),
    staleTime: STALE_LISTS,
  });

  const columns = useMemo<ColumnDef<AuditoriaItem, unknown>[]>(
    () => [
      { accessorKey: 'createdAt', header: 'Fecha', cell: ({ row }) => formatDateTime(row.original.createdAt) },
      {
        id: 'usuario',
        header: 'Usuario',
        cell: ({ row }) => row.original.usuario?.nombreCompleto ?? <span className="text-muted-foreground">Sistema</span>,
      },
      { accessorKey: 'entidad', header: 'Entidad' },
      {
        id: 'entidadId',
        header: 'ID',
        cell: ({ row }) => row.original.entidadId ?? '—',
      },
      {
        accessorKey: 'accion',
        header: 'Acción',
        cell: ({ row }) => (
          <Badge variant={ACCION_VARIANT[row.original.accion] ?? 'secondary'}>{row.original.accion}</Badge>
        ),
      },
      { accessorKey: 'ip', header: 'IP', cell: ({ row }) => row.original.ip ?? '—' },
      {
        id: 'detalle',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setDetalle(row.original)}>
            <Eye className="h-4 w-4" />
            Ver
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Auditoría"
        description="Bitácora de creación, edición, validación, rechazo y borrado."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto no-scrollbar">
          <TabsTrigger value="registro">Registro de auditoría</TabsTrigger>
          <TabsTrigger value="bcv">Historial tasa BCV</TabsTrigger>
        </TabsList>

        <TabsContent value="registro">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="a-desde">Desde</Label>
              <Input id="a-desde" type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-hasta">Hasta</Label>
              <Input id="a-hasta" type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-usuario">Usuario</Label>
              <Select id="a-usuario" value={usuarioId} onChange={(e) => { setUsuarioId(e.target.value); setPage(1); }}>
                <option value="">Todos</option>
                {usuariosQuery.data?.data.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombreCompleto}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-entidad">Entidad</Label>
              <Input id="a-entidad" placeholder="Ej. pagos_reportados" value={entidad} onChange={(e) => { setEntidad(e.target.value); setPage(1); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-accion">Acción</Label>
              <Select id="a-accion" value={accion} onChange={(e) => { setAccion(e.target.value); setPage(1); }}>
                <option value="">Todas</option>
                {ACCIONES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <ClearFiltersButton
                current={{ fechaDesde, fechaHasta, usuarioId, entidad, accion }}
                initial={{ fechaDesde: '', fechaHasta: '', usuarioId: '', entidad: '', accion: '' }}
                onClear={() => {
                  setFechaDesde('');
                  setFechaHasta('');
                  setUsuarioId('');
                  setEntidad('');
                  setAccion('');
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
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </p>
                      <p className="truncate font-medium">
                        {row.entidad}
                        {row.entidadId ? ` #${row.entidadId}` : ''}
                      </p>
                    </div>
                    <Badge variant={ACCION_VARIANT[row.accion] ?? 'secondary'}>{row.accion}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Usuario</dt>
                      <dd className="truncate">
                        {row.usuario?.nombreCompleto ?? (
                          <span className="text-muted-foreground">Sistema</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">IP</dt>
                      <dd className="truncate">{row.ip ?? '—'}</dd>
                    </div>
                  </dl>
                  <div className="pt-1">
                    <Button variant="outline" size="sm" onClick={() => setDetalle(row)}>
                      <Eye className="h-4 w-4" />
                      Ver detalle
                    </Button>
                  </div>
                </div>
              )}
              emptyTitle="Sin registros de auditoría"
              emptyDescription="No hay eventos que coincidan con los filtros."
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
            open={detalle !== null}
            onClose={() => setDetalle(null)}
            title="Detalle de auditoría"
            description={detalle ? `${detalle.entidad} #${detalle.entidadId ?? '—'} · ${detalle.accion}` : undefined}
            className="sm:max-w-3xl"
            footer={<Button variant="outline" onClick={() => setDetalle(null)}>Cerrar</Button>}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Datos anteriores</p>
                <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                  {JSON.stringify(detalle?.datosAntes ?? null, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Datos posteriores</p>
                <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                  {JSON.stringify(detalle?.datosDespues ?? null, null, 2)}
                </pre>
              </div>
            </div>
          </Dialog>
        </TabsContent>

        <TabsContent value="bcv">
          <HistorialBcvTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
