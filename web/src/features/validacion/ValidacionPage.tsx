import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  HelpCircle,
  Keyboard,
  Link2,
  Paperclip,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  eliminarPago,
  getCoincidencias,
  listarPagos,
  marcarDuplicado,
  rechazarPago,
  revertirPago,
  validarLote,
  validarPago,
} from '@/api/pagos';
import { listarCobradores } from '@/api/cobradores';
import { getCatalogoFormPago } from '@/api/pagos';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_CATALOGS, STALE_LISTS } from '@/lib/queryClient';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermiso } from '@/hooks/usePermiso';
import { formatBs, formatDate, formatMoney, formatRate, formatUsd } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { DateRangeFilter } from '@/components/common/DateRangeFilter';
import { FilePreviewDialog } from '@/components/common/FilePreviewDialog';
import { AntiguedadVeredicto, descripcionVeredicto, EstadoBadge, TipoCobroBadge } from '@/features/pagos/pago-utils';
import { EditarPagoDialog } from '@/features/pagos/EditarPagoDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { DuplicadoInfo, PagoReportado, RevertirPagoEstado, RevertirPagoInput } from '@/types';

const PAGE_SIZE = 20;

const DUPLICADO_NO_AUTOMATICO =
  'El pago coincide con un movimiento bancario ya conciliado con otro pago. Seleccione manualmente el movimiento con el que desea validarlo.';

function PuntajeBadge({ puntaje, exacta }: { puntaje: number; exacta: boolean }) {
  const variant = puntaje >= 90 ? 'success' : puntaje >= 60 ? 'warning' : 'secondary';
  return (
    <Badge variant={variant}>
      {puntaje} pts {exacta && '· ref. exacta'}
    </Badge>
  );
}

/**
 * CR-001 R3 warning. Prominent and visually distinct from the "no matches"
 * empty state: the payment is not unmatched, it matches a movement that is
 * already reconciled with another payment.
 */
function DuplicadoAviso({ duplicado }: { duplicado: DuplicadoInfo }) {
  return (
    <div role="alert" className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="space-y-1">
          <p className="font-semibold text-amber-800 dark:text-amber-300">Posible duplicado</p>
          <p className="text-muted-foreground">
            El pago coincide con el movimiento bancario{' '}
            <span className="font-medium text-foreground">{duplicado.referencia}</span> (
            {formatBs(duplicado.montoBs)}), que ya está conciliado con otro pago (id{' '}
            {duplicado.pagoReportadoId}).
          </p>
          <p className="text-muted-foreground">
            Por eso no se puede validar automáticamente. Seleccione manualmente el movimiento con el
            que desea validarlo, o rechace el pago o márquelo como duplicado.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ValidacionPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();
  const puedeEliminar = tiene('pagos.eliminar');
  const puedeRevertir = tiene('pagos.revertir_validacion');
  const puedeEditar = tiene('pagos.editar');
  const puedeEditarPago = (pago: PagoReportado) =>
    puedeEditar && (pago.estado === 'pendiente' || pago.estado === 'validado');

  const [page, setPage] = useState(1);
  const [estadoFiltro, setEstadoFiltro] = useState('pendiente');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [cobradorId, setCobradorId] = useState('');
  const [bancoOrigenId, setBancoOrigenId] = useState('');
  const [referencia, setReferencia] = useState('');
  const [montoMin, setMontoMin] = useState('');
  const [montoMax, setMontoMax] = useState('');
  const debouncedRef = useDebounce(referencia, 300);
  const debouncedMin = useDebounce(montoMin, 300);
  const debouncedMax = useDebounce(montoMax, 300);

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rechazarOpen, setRechazarOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [duplicadoOpen, setDuplicadoOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [eliminarTarget, setEliminarTarget] = useState<PagoReportado | null>(null);
  const [editarTarget, setEditarTarget] = useState<PagoReportado | null>(null);
  const [revertirTarget, setRevertirTarget] = useState<PagoReportado | null>(null);
  const [revertirEstado, setRevertirEstado] = useState<RevertirPagoEstado>('pendiente');
  const [revertirMotivo, setRevertirMotivo] = useState('');
  const [comprobante, setComprobante] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      estado: estadoFiltro,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      cobradorId: cobradorId || undefined,
      bancoOrigenId: bancoOrigenId || undefined,
      referencia: debouncedRef || undefined,
      montoMin: debouncedMin || undefined,
      montoMax: debouncedMax || undefined,
    }),
    [page, estadoFiltro, fechaDesde, fechaHasta, cobradorId, bancoOrigenId, debouncedRef, debouncedMin, debouncedMax],
  );

  const query = useQuery({
    queryKey: queryKeys.pagos(params),
    queryFn: () => listarPagos(params),
    staleTime: STALE_LISTS,
  });

  const cobradores = useQuery({
    queryKey: queryKeys.cobradores({ pageSize: 200, activo: true }),
    queryFn: () => listarCobradores({ pageSize: 200, activo: true }),
    staleTime: STALE_CATALOGS,
  });
  const catalogos = useQuery({
    queryKey: queryKeys.catalogoFormPago(),
    queryFn: getCatalogoFormPago,
    staleTime: STALE_CATALOGS,
  });

  const filas = query.data?.data ?? [];
  const activePago = useMemo(() => filas.find((f) => f.id === activeId) ?? null, [filas, activeId]);

  const coincidencias = useQuery({
    queryKey: queryKeys.coincidencias(activeId ?? 0),
    queryFn: () => getCoincidencias(activeId as number),
    enabled: activeId !== null,
    staleTime: 0,
  });

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pagos'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['movimientos'] });
  }, [queryClient]);

  // After an edit the active row can leave the current filter (e.g. the edited
  // reference/amount no longer matches). Refetch first, then drop the selection
  // if the payment is gone, so the side panel never shows a dead selection that
  // looks like the edit failed.
  function handleEditarSuccess() {
    const editedId = editarTarget?.id ?? null;
    void (async () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      await queryClient.invalidateQueries({ queryKey: ['pagos'] });
      if (editedId === null) return;
      const refreshed = queryClient.getQueryData<{ data: PagoReportado[] }>(
        queryKeys.pagos(params),
      );
      const sigueEnLaLista = refreshed?.data.some((p) => p.id === editedId) ?? false;
      if (!sigueEnLaLista) {
        setActiveId((actual) => (actual === editedId ? null : actual));
      }
    })();
  }

  const validarMutation = useMutation({
    mutationFn: ({ id, movimientoBancoId }: { id: number; movimientoBancoId?: number }) =>
      validarPago(id, movimientoBancoId),
    onSuccess: (data) => {
      toast.success('Pago validado', descripcionVeredicto(data));
      setActiveId(null);
      invalidar();
    },
    onError: (error) => toast.error('No se pudo validar', getApiErrorMessage(error)),
  });

  const rechazarMutation = useMutation({
    mutationFn: ({ id, motivoRechazo }: { id: number; motivoRechazo: string }) =>
      rechazarPago(id, motivoRechazo),
    onSuccess: () => {
      toast.success('Pago rechazado');
      setRechazarOpen(false);
      setMotivo('');
      setActiveId(null);
      invalidar();
    },
    onError: (error) => toast.error('No se pudo rechazar', getApiErrorMessage(error)),
  });

  const duplicadoMutation = useMutation({
    mutationFn: (id: number) => marcarDuplicado(id),
    onSuccess: () => {
      toast.success('Pago marcado como duplicado');
      setDuplicadoOpen(false);
      setActiveId(null);
      invalidar();
    },
    onError: (error) => toast.error('No se pudo marcar', getApiErrorMessage(error)),
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => eliminarPago(id),
    onSuccess: (_data, id) => {
      toast.success('Pago eliminado');
      setEliminarTarget(null);
      setActiveId((current) => (current === id ? null : current));
      invalidar();
    },
    onError: (error) => toast.error('No se pudo eliminar', getApiErrorMessage(error)),
  });

  const revertirMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: RevertirPagoInput }) => revertirPago(id, input),
    onSuccess: (_data, { id }) => {
      toast.success('Validación revertida', 'El movimiento bancario vuelve a quedar no conciliado.');
      setRevertirTarget(null);
      setActiveId((current) => (current === id ? null : current));
      invalidar();
    },
    onError: (error) => toast.error('No se pudo revertir', getApiErrorMessage(error)),
  });

  const revertirMotivoInvalido =
    revertirEstado === 'rechazado' && revertirMotivo.trim().length < 3;

  function abrirRevertir(pago: PagoReportado) {
    setRevertirTarget(pago);
    setRevertirEstado('pendiente');
    setRevertirMotivo('');
  }

  function confirmarRevertir() {
    if (!revertirTarget || revertirMotivoInvalido) return;
    revertirMutation.mutate({
      id: revertirTarget.id,
      input:
        revertirEstado === 'rechazado'
          ? { estado: 'rechazado', motivoRechazo: revertirMotivo.trim() }
          : { estado: 'pendiente' },
    });
  }

  const duplicado = coincidencias.data?.duplicado ?? null;
  const sugerencias = coincidencias.data?.data ?? [];
  const mejorCoincidencia = sugerencias[0] ?? null;

  function abrirComprobante() {
    if (activePago?.soporteUrl) setComprobante(activePago.soporteUrl);
  }

  function avisarDuplicado() {
    toast.toast({
      variant: 'warning',
      title: 'Validación automática no disponible',
      description: DUPLICADO_NO_AUTOMATICO,
    });
  }

  // Automatic path (empty body): the backend cannot resolve a duplicate, so the
  // tray intercepts it instead of firing a request that would return 409.
  function validarAutomatico() {
    if (!activePago) return;
    if (duplicado) {
      avisarDuplicado();
      return;
    }
    validarMutation.mutate({ id: activePago.id });
  }

  function aprobarActivo() {
    if (!activeId) return;
    if (duplicado) {
      avisarDuplicado();
      return;
    }
    if (mejorCoincidencia) {
      validarMutation.mutate({ id: activeId, movimientoBancoId: mejorCoincidencia.movimiento.id });
    } else {
      validarMutation.mutate({ id: activeId });
    }
  }

  // ---- Atajos de teclado ----
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
    if (rechazarOpen || helpOpen || duplicadoOpen) return;
    if (
      eliminarTarget !== null ||
      editarTarget !== null ||
      revertirTarget !== null ||
      comprobante !== null
    )
      return;
    if (filas.length === 0) return;

    const index = filas.findIndex((f) => f.id === activeId);

    if (e.key === 'j') {
      e.preventDefault();
      const next = filas[Math.min(filas.length - 1, index < 0 ? 0 : index + 1)];
      setActiveId(next.id);
    } else if (e.key === 'k') {
      e.preventDefault();
      const prev = filas[Math.max(0, index < 0 ? 0 : index - 1)];
      setActiveId(prev.id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      aprobarActivo();
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      aprobarActivo();
    } else if (e.key === 'r') {
      e.preventDefault();
      if (activeId) setRechazarOpen(true);
    }
  };

  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // En móvil el panel de coincidencias queda debajo de la lista: al elegir una
  // tarjeta se desplaza hasta el panel para que la validación sea alcanzable.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeId === null) return;
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeId]);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((k) => rowSelection[k]).map(Number),
    [rowSelection],
  );

  async function handleBulkExactos() {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const resultados = await Promise.all(
        selectedIds.map(async (id) => ({
          id,
          coincidencias: await getCoincidencias(id).catch(() => null),
        })),
      );
      const items = resultados
        .map(({ id, coincidencias: cs }) => {
          const exacta = cs?.data.find(
            (c) => c.referenciaExacta && Math.abs(Number(c.diferenciaMontoBs)) === 0,
          );
          return exacta ? { pagoReportadoId: id, movimientoBancoId: exacta.movimiento.id } : null;
        })
        .filter((x): x is { pagoReportadoId: number; movimientoBancoId: number } => x !== null);

      if (items.length === 0) {
        toast.error('Sin coincidencias exactas', 'Ninguno de los seleccionados tiene una coincidencia exacta.');
        return;
      }
      const res = await validarLote(items);
      if (res.errores.length === 0) {
        toast.success('Validación en lote completada', `${res.procesados} pagos validados.`);
      } else {
        const duplicados = res.errores.filter((e) =>
          e.motivo.toLowerCase().includes('duplicado'),
        ).length;
        const detalle = res.errores
          .slice(0, 3)
          .map((e) => `Pago #${e.pagoReportadoId}: ${e.motivo}`)
          .join(' · ');
        toast.toast({
          variant: 'warning',
          title: `Validación en lote: ${res.procesados} validados, ${res.errores.length} con error`,
          description:
            (duplicados > 0
              ? `${duplicados} por posible duplicado y requieren validación manual. `
              : '') +
            (res.errores.length > 3 ? `${detalle} …` : detalle),
        });
      }
      setRowSelection({});
      invalidar();
    } catch (error) {
      toast.error('No se pudo validar el lote', getApiErrorMessage(error));
    } finally {
      setBulkLoading(false);
    }
  }

  const columns = useMemo<ColumnDef<PagoReportado, unknown>[]>(
    () => [
      { accessorKey: 'fechaPago', header: 'Fecha', cell: ({ row }) => formatDate(row.original.fechaPago) },
      {
        id: 'cobrador',
        header: 'Cobrador',
        cell: ({ row }) => (
          <span>
            {row.original.cobrador.nombre}
            <span className="ml-1 text-xs text-muted-foreground">({row.original.cobrador.codigo})</span>
          </span>
        ),
      },
      {
        id: 'banco',
        header: 'Banco',
        cell: ({ row }) => row.original.bancoOrigen?.nombre ?? 'N/A',
      },
      { accessorKey: 'referencia', header: 'Referencia' },
      {
        accessorKey: 'montoBs',
        header: 'Monto Bs',
        cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.montoBs)}</span>,
      },
      {
        accessorKey: 'montoUsd',
        header: 'Monto USD',
        cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.montoUsd)}</span>,
      },
      {
        accessorKey: 'tasa',
        header: 'Tasa derivada',
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{formatRate(row.original.tasa)}</span>
        ),
      },
      {
        id: 'tipo',
        header: 'Tipo',
        cell: ({ row }) => <TipoCobroBadge tipo={row.original.tipoCobroDerivado ?? row.original.tipoCobro} />,
      },
      {
        id: 'antiguedad',
        header: 'Antigüedad',
        cell: ({ row }) => <AntiguedadVeredicto pago={row.original} />,
      },
      {
        id: 'revisar',
        header: 'Revisar',
        cell: ({ row }) =>
          row.original.revisarClasificacion ? <Badge variant="warning">Revisar</Badge> : null,
      },
      {
        id: 'soporte',
        header: 'Comprob.',
        cell: ({ row }) =>
          row.original.soporteUrl ? (
            <Paperclip
              className="h-4 w-4 text-muted-foreground"
              role="img"
              aria-label="Tiene comprobante"
            />
          ) : null,
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Bandeja de validación"
        description="Cruza los pagos reportados contra los movimientos bancarios importados."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
              <Keyboard className="h-4 w-4" />
              Atajos
            </Button>
            <Button
              size="sm"
              variant="success"
              disabled={selectedIds.length === 0 || bulkLoading}
              loading={bulkLoading}
              onClick={handleBulkExactos}
            >
              <ShieldCheck className="h-4 w-4" />
              Validar exactos ({selectedIds.length})
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <DateRangeFilter
          desde={fechaDesde}
          hasta={fechaHasta}
          idPrefix="v"
          onDesdeChange={(value) => { setFechaDesde(value); setPage(1); }}
          onHastaChange={(value) => { setFechaHasta(value); setPage(1); }}
        />
        <div className="space-y-1.5">
          <Label htmlFor="v-estado">Estado</Label>
          <Select
            id="v-estado"
            value={estadoFiltro}
            onChange={(e) => { setEstadoFiltro(e.target.value); setPage(1); setActiveId(null); }}
          >
            <option value="pendiente">Pendiente</option>
            <option value="validado">Validado</option>
            <option value="rechazado">Rechazado</option>
            <option value="duplicado">Duplicado</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-cobrador">Cobrador</Label>
          <Select id="v-cobrador" value={cobradorId} onChange={(e) => { setCobradorId(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {cobradores.data?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-banco">Banco origen</Label>
          <Select id="v-banco" value={bancoOrigenId} onChange={(e) => { setBancoOrigenId(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {catalogos.data?.bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-ref">Referencia</Label>
          <Input id="v-ref" value={referencia} onChange={(e) => { setReferencia(e.target.value); setPage(1); }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="v-min">USD mín.</Label>
            <Input id="v-min" inputMode="decimal" value={montoMin} onChange={(e) => { setMontoMin(e.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-max">USD máx.</Label>
            <Input id="v-max" inputMode="decimal" value={montoMax} onChange={(e) => { setMontoMax(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className="flex items-end">
          <ClearFiltersButton
            current={{ estadoFiltro, fechaDesde, fechaHasta, cobradorId, bancoOrigenId, referencia, montoMin, montoMax }}
            initial={{ estadoFiltro: 'pendiente', fechaDesde: '', fechaHasta: '', cobradorId: '', bancoOrigenId: '', referencia: '', montoMin: '', montoMax: '' }}
            onClear={() => {
              setEstadoFiltro('pendiente');
              setFechaDesde('');
              setFechaHasta('');
              setCobradorId('');
              setBancoOrigenId('');
              setReferencia('');
              setMontoMin('');
              setMontoMax('');
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <DataTable
              columns={columns}
              data={filas}
              isLoading={query.isLoading}
              getRowId={(row) => String(row.id)}
              enableRowSelection
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              rowClassName={(row) => cn(row.id === activeId && 'bg-primary/10')}
              onRowClick={(row) => setActiveId(row.id)}
              mobileCard={(row) => (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.referencia}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(row.fechaPago)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {row.soporteUrl && (
                        <Paperclip
                          className="h-4 w-4 text-muted-foreground"
                          role="img"
                          aria-label="Tiene comprobante"
                        />
                      )}
                      <TipoCobroBadge tipo={row.tipoCobroDerivado ?? row.tipoCobro} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Cobrador</dt>
                      <dd className="truncate">
                        {row.cobrador.nombre}{' '}
                        <span className="text-muted-foreground">({row.cobrador.codigo})</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Banco origen</dt>
                      <dd className="truncate">{row.bancoOrigen?.nombre ?? 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Tasa derivada</dt>
                      <dd className="tabular-nums text-muted-foreground">{formatRate(row.tasa)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Monto Bs</dt>
                      <dd className="tabular-nums">{formatMoney(row.montoBs)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Monto USD</dt>
                      <dd className="tabular-nums">{formatMoney(row.montoUsd)}</dd>
                    </div>
                  </dl>
                  {row.revisarClasificacion && <Badge variant="warning">Revisar clasificación</Badge>}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">Antigüedad:</span>
                    <AntiguedadVeredicto pago={row} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Toque la tarjeta para ver las coincidencias bancarias.
                  </p>
                  {(puedeEditarPago(row) ||
                    (puedeRevertir && row.estado === 'validado') ||
                    (puedeEliminar && row.estado !== 'validado')) && (
                    <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                      {puedeEditarPago(row) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setEditarTarget(row)}
                        >
                          <Pencil className="h-4 w-4" />
                          Editar pago
                        </Button>
                      )}
                      {puedeRevertir && row.estado === 'validado' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => abrirRevertir(row)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Revertir validación
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
                          Eliminar pago
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              emptyTitle={estadoFiltro === 'pendiente' ? 'Sin pagos pendientes' : 'Sin pagos'}
              emptyDescription={
                estadoFiltro === 'pendiente'
                  ? 'No hay pagos por validar con los filtros aplicados.'
                  : 'No hay pagos con los filtros aplicados.'
              }
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

        {/* Panel lateral de coincidencias */}
        <div ref={panelRef} className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">Coincidencias sugeridas</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Seleccione un pago de la tabla para ver los movimientos compatibles.
            </p>
          </div>

          {!activePago ? (
            <EmptyState
              icon={<Link2 className="h-6 w-6" />}
              title="Ningún pago seleccionado"
              description="Elija una fila para buscar coincidencias bancarias."
            />
          ) : (
            <div className="space-y-4 p-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{activePago.referencia}</span>
                  <EstadoBadge estado={activePago.estado} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activePago.cobrador.nombre} · {activePago.bancoOrigen?.nombre ?? 'N/A'}
                </p>
                {activePago.tipoPago?.nombre && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tipo de pago: {activePago.tipoPago.nombre}
                  </p>
                )}
                <p className="mt-1 text-xs">
                  {formatBs(activePago.montoBs)} · {formatUsd(activePago.montoUsd)} ·{' '}
                  <span className="font-medium">Tasa {formatRate(activePago.tasa)}</span>
                </p>
                <div className="mt-2">
                  {activePago.soporteUrl ? (
                    <button
                      type="button"
                      onClick={abrirComprobante}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver comprobante
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin comprobante</span>
                  )}
                </div>
              </div>

              {activePago.estado === 'pendiente' && (
                <>
                  {duplicado && <DuplicadoAviso duplicado={duplicado} />}
                  {coincidencias.isLoading ? (
                    <div className="flex justify-center py-6">
                      <Spinner />
                    </div>
                  ) : coincidencias.isError ? (
                    <ErrorState error={coincidencias.error} onRetry={() => coincidencias.refetch()} />
                  ) : sugerencias.length === 0 ? (
                    !duplicado && (
                      <EmptyState
                        title="Sin coincidencias"
                        description="No se encontraron movimientos bancarios compatibles."
                      />
                    )
                  ) : (
                    <ul className="space-y-2">
                      {sugerencias.map((c) => (
                        <li key={c.movimiento.id} className="rounded-md border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{c.movimiento.referencia}</span>
                            <PuntajeBadge puntaje={c.puntaje} exacta={c.referenciaExacta} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(c.movimiento.fechaEjecucion)} · {formatBs(c.movimiento.montoBs)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[
                              c.referenciaExacta ? 'referencia exacta' : 'referencia por sufijo',
                              Number(c.diferenciaMontoBs) === 0
                                ? 'monto exacto'
                                : `diferencia ${formatBs(c.diferenciaMontoBs)}`,
                              `±${c.diferenciaDias} día(s)`,
                            ].join(' · ')}
                          </p>
                          <Button
                            size="sm"
                            className="mt-2 w-full"
                            loading={validarMutation.isPending}
                            onClick={() =>
                              validarMutation.mutate({ id: activePago.id, movimientoBancoId: c.movimiento.id })
                            }
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Validar con este movimiento
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              <div className="space-y-2 border-t pt-3">
                {activePago.estado === 'pendiente' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="success"
                      onClick={validarAutomatico}
                      loading={validarMutation.isPending}
                      title={
                        duplicado
                          ? 'No disponible: el pago coincide con un movimiento ya conciliado con otro pago. Seleccione el movimiento manualmente.'
                          : undefined
                      }
                      aria-describedby={duplicado ? 'validar-automatico-motivo' : undefined}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Validar
                    </Button>
                    <Button variant="destructive" onClick={() => setRechazarOpen(true)}>
                      <XCircle className="h-4 w-4" />
                      Rechazar
                    </Button>
                    {duplicado && (
                      <p id="validar-automatico-motivo" className="col-span-2 text-xs text-muted-foreground">
                        La validación automática no está disponible para este pago. Use «Validar con
                        este movimiento», «Rechazar» o «Marcar como duplicado».
                      </p>
                    )}
                    <Button
                      variant="outline"
                      className="col-span-2"
                      onClick={() => setDuplicadoOpen(true)}
                    >
                      <Copy className="h-4 w-4" />
                      Marcar como duplicado
                    </Button>
                    {puedeEditarPago(activePago) && (
                      <Button
                        variant="outline"
                        className="col-span-2"
                        onClick={() => setEditarTarget(activePago)}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar pago
                      </Button>
                    )}
                  </div>
                )}

                {activePago.estado === 'validado' && (puedeEditarPago(activePago) || puedeRevertir) && (
                  <div className="grid gap-2">
                    {puedeEditarPago(activePago) && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setEditarTarget(activePago)}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar pago
                      </Button>
                    )}
                    {puedeRevertir && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => abrirRevertir(activePago)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Revertir validación
                      </Button>
                    )}
                  </div>
                )}

                {activePago.estado !== 'validado' && puedeEliminar && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => setEliminarTarget(activePago)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar pago
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <EditarPagoDialog
        pago={editarTarget}
        onClose={() => setEditarTarget(null)}
        onSuccess={handleEditarSuccess}
      />

      {/* Rechazar */}
      <Dialog
        open={rechazarOpen}
        onClose={() => setRechazarOpen(false)}
        title="Rechazar pago"
        description="Indique el motivo del rechazo (obligatorio)."
        footer={
          <>
            <Button variant="outline" onClick={() => setRechazarOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={rechazarMutation.isPending}
              disabled={motivo.trim().length < 3}
              onClick={() =>
                activePago && rechazarMutation.mutate({ id: activePago.id, motivoRechazo: motivo.trim() })
              }
            >
              Rechazar pago
            </Button>
          </>
        }
      >
        <Textarea
          rows={3}
          placeholder="Ej. No se encontró el movimiento bancario correspondiente."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        {motivo.length > 0 && motivo.trim().length < 3 && (
          <p className="mt-1 text-xs text-destructive">El motivo debe tener al menos 3 caracteres.</p>
        )}
      </Dialog>

      {/* Duplicado */}
      <Dialog
        open={duplicadoOpen}
        onClose={() => setDuplicadoOpen(false)}
        title="Marcar como duplicado"
        description="Confirme que este pago reportado es un duplicado."
        footer={
          <>
            <Button variant="outline" onClick={() => setDuplicadoOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={duplicadoMutation.isPending}
              onClick={() => activePago && duplicadoMutation.mutate(activePago.id)}
            >
              Marcar duplicado
            </Button>
          </>
        }
      />

      {/* Revertir validación */}
      <Dialog
        open={revertirTarget !== null}
        onClose={() => setRevertirTarget(null)}
        title="Revertir validación"
        description="Deshaga la validación de este pago y elija su nuevo estado."
        footer={
          <>
            <Button variant="outline" onClick={() => setRevertirTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={revertirMutation.isPending}
              disabled={revertirMotivoInvalido}
              onClick={confirmarRevertir}
            >
              Revertir validación
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            Al revertir se deshace la conciliación: el movimiento bancario vinculado vuelve a quedar{' '}
            <span className="font-medium">no conciliado</span> y podrá conciliarse de nuevo. El pago
            regresará al estado que seleccione a continuación.
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="revertir-estado">Estado destino</Label>
            <Select
              id="revertir-estado"
              value={revertirEstado}
              onChange={(e) => setRevertirEstado(e.target.value as RevertirPagoEstado)}
            >
              <option value="pendiente">Pendiente</option>
              <option value="rechazado">Rechazado</option>
            </Select>
          </div>
          {revertirEstado === 'rechazado' && (
            <div className="space-y-1.5">
              <Label htmlFor="revertir-motivo">Motivo del rechazo</Label>
              <Textarea
                id="revertir-motivo"
                rows={3}
                placeholder="Ej. La validación fue un error; el movimiento no corresponde."
                value={revertirMotivo}
                onChange={(e) => setRevertirMotivo(e.target.value)}
              />
              {revertirMotivo.length > 0 && revertirMotivo.trim().length < 3 && (
                <p className="text-xs text-destructive">
                  El motivo debe tener al menos 3 caracteres.
                </p>
              )}
            </div>
          )}
        </div>
      </Dialog>

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

      {/* Ayuda de atajos */}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Atajos de teclado">
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2 text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
            Los atajos se desactivan mientras escribe en un campo.
          </p>
          <ul className="divide-y rounded-md border">
            <li className="flex items-center justify-between px-3 py-2">
              <span>Mover a la siguiente fila</span>
              <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-semibold">J</kbd>
            </li>
            <li className="flex items-center justify-between px-3 py-2">
              <span>Mover a la fila anterior</span>
              <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-semibold">K</kbd>
            </li>
            <li className="flex items-center justify-between px-3 py-2">
              <span>Validar con la mejor coincidencia</span>
              <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-semibold">Enter</kbd>
            </li>
            <li className="flex items-center justify-between px-3 py-2">
              <span>Aprobar el pago activo (mejor coincidencia)</span>
              <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-semibold">A</kbd>
            </li>
            <li className="flex items-center justify-between px-3 py-2">
              <span>Rechazar el pago activo</span>
              <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-semibold">R</kbd>
            </li>
          </ul>
        </div>
      </Dialog>

      <FilePreviewDialog
        open={comprobante !== null}
        onClose={() => setComprobante(null)}
        titulo="Comprobante de pago"
        soporteUrl={comprobante}
      />
    </div>
  );
}
