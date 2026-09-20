import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  CATEGORIAS_GASTO,
  actualizarGasto,
  crearGasto,
  eliminarGasto,
  listarGastos,
  subirSoporte,
  type GastoInput,
} from '@/api/gastos';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_LISTS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { useDebounce } from '@/hooks/useDebounce';
import { derivedRate, formatDate, formatMoney, formatRate, todayInputDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FilePreviewDialog } from '@/components/common/FilePreviewDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { Gasto } from '@/types';

const PAGE_SIZE = 20;

interface FormState {
  fecha: string;
  montoBs: string;
  montoUsd: string;
  referencia: string;
  descripcion: string;
  categoria: string;
  autorizadoPor: string;
}

const emptyForm: FormState = {
  fecha: todayInputDate(),
  montoBs: '',
  montoUsd: '',
  referencia: '',
  descripcion: '',
  categoria: 'Operativo',
  autorizadoPor: '',
};

export default function GastosPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [page, setPage] = useState(1);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [categoria, setCategoria] = useState('');
  const [autorizadoPor, setAutorizadoPor] = useState('');
  const debouncedAutorizado = useDebounce(autorizadoPor, 300);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [soporteFile, setSoporteFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [eliminarTarget, setEliminarTarget] = useState<Gasto | null>(null);
  const [preview, setPreview] = useState<{ url: string; nombre?: string } | null>(null);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      categoria: categoria || undefined,
      autorizadoPor: debouncedAutorizado || undefined,
    }),
    [page, fechaDesde, fechaHasta, categoria, debouncedAutorizado],
  );

  const query = useQuery({
    queryKey: queryKeys.gastos(params),
    queryFn: () => listarGastos(params),
    staleTime: STALE_LISTS,
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['gastos'] });

  const guardarMutation = useMutation({
    mutationFn: async () => {
      const payload: GastoInput = {
        fecha: form.fecha,
        montoBs: form.montoBs.replace(',', '.'),
        montoUsd: form.montoUsd.replace(',', '.'),
        referencia: form.referencia || undefined,
        descripcion: form.descripcion,
        categoria: form.categoria,
        autorizadoPor: form.autorizadoPor,
      };
      const gasto = editando ? await actualizarGasto(editando.id, payload) : await crearGasto(payload);
      if (soporteFile) {
        await subirSoporte(gasto.id, soporteFile);
      }
      return gasto;
    },
    onSuccess: () => {
      toast.success(editando ? 'Gasto actualizado' : 'Gasto registrado');
      setDialogOpen(false);
      setSoporteFile(null);
      invalidar();
      queryClient.invalidateQueries({ queryKey: ['reportes'] });
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => eliminarGasto(id),
    onSuccess: () => {
      toast.success('Gasto eliminado');
      setEliminarTarget(null);
      invalidar();
    },
    onError: (error) => toast.error('No se pudo eliminar', getApiErrorMessage(error)),
  });

  function abrirCrear() {
    setEditando(null);
    setForm(emptyForm);
    setSoporteFile(null);
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEditar(g: Gasto) {
    setEditando(g);
    setForm({
      fecha: g.fecha.slice(0, 10),
      montoBs: g.montoBs,
      montoUsd: g.montoUsd,
      referencia: g.referencia ?? '',
      descripcion: g.descripcion,
      categoria: g.categoria,
      autorizadoPor: g.autorizadoPor,
    });
    setSoporteFile(null);
    setFormError(null);
    setDialogOpen(true);
  }

  const tasaPreview = derivedRate(form.montoBs.replace(',', '.') || '0', form.montoUsd.replace(',', '.') || '0');
  const formValido =
    form.fecha &&
    form.descripcion.trim() &&
    form.categoria.trim() &&
    form.autorizadoPor.trim() &&
    Number(form.montoBs.replace(',', '.')) > 0 &&
    Number(form.montoUsd.replace(',', '.')) > 0;

  const columns = useMemo<ColumnDef<Gasto, unknown>[]>(
    () => [
      { accessorKey: 'fecha', header: 'Fecha', cell: ({ row }) => formatDate(row.original.fecha) },
      {
        accessorKey: 'descripcion',
        header: 'Descripción',
        cell: ({ row }) => <span className="block max-w-[20rem] truncate">{row.original.descripcion}</span>,
      },
      { accessorKey: 'categoria', header: 'Categoría' },
      {
        accessorKey: 'montoUsd',
        header: 'Monto USD',
        cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.montoUsd)}</span>,
      },
      {
        accessorKey: 'montoBs',
        header: 'Monto Bs',
        cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.montoBs)}</span>,
      },
      {
        accessorKey: 'tasa',
        header: 'Tasa',
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{formatRate(row.original.tasa)}</span>,
      },
      { accessorKey: 'autorizadoPor', header: 'Autorizado por' },
      {
        id: 'soporte',
        header: 'Soporte',
        cell: ({ row }) => {
          const url = row.original.soporteUrl;
          return url ? (
            <button
              type="button"
              onClick={() => setPreview({ url })}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <FileText className="h-4 w-4" />
              Ver
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {tiene('gastos.editar') && (
              <Button variant="ghost" size="icon" onClick={() => abrirEditar(row.original)} aria-label="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {tiene('gastos.eliminar') && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => setEliminarTarget(row.original)}
                aria-label="Eliminar"
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
        title="Gastos"
        description="Salidas de dinero asociadas a los fondos recaudados. Restan en el flujo de caja."
        actions={
          tiene('gastos.crear') ? (
            <Button onClick={abrirCrear}>
              <Plus className="h-4 w-4" />
              Registrar gasto
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="g-desde">Desde</Label>
          <Input id="g-desde" type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-hasta">Hasta</Label>
          <Input id="g-hasta" type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-categoria">Categoría</Label>
          <Select id="g-categoria" value={categoria} onChange={(e) => { setCategoria(e.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="g-autorizado">Autorizado por</Label>
          <Input
            id="g-autorizado"
            placeholder="Buscar…"
            value={autorizadoPor}
            onChange={(e) => { setAutorizadoPor(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex items-end">
          <ClearFiltersButton
            current={{ fechaDesde, fechaHasta, categoria, autorizadoPor }}
            initial={{ fechaDesde: '', fechaHasta: '', categoria: '', autorizadoPor: '' }}
            onClear={() => {
              setFechaDesde('');
              setFechaHasta('');
              setCategoria('');
              setAutorizadoPor('');
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
          mobileCard={(row) => {
            const url = row.soporteUrl;
            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-medium">{row.descripcion}</p>
                  <Badge variant="secondary">{row.categoria}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(row.fecha)}</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Monto USD</dt>
                    <dd className="tabular-nums">{formatMoney(row.montoUsd)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Monto Bs</dt>
                    <dd className="tabular-nums">{formatMoney(row.montoBs)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tasa</dt>
                    <dd className="tabular-nums text-muted-foreground">{formatRate(row.tasa)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Autorizado por</dt>
                    <dd className="truncate">{row.autorizadoPor}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {url && (
                    <button
                      type="button"
                      onClick={() => setPreview({ url })}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      <FileText className="h-4 w-4" />
                      Ver soporte
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    {tiene('gastos.editar') && (
                      <Button variant="outline" size="sm" onClick={() => abrirEditar(row)}>
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                    )}
                    {tiene('gastos.eliminar') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setEliminarTarget(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          }}
          emptyTitle="Sin gastos registrados"
          emptyDescription="No hay gastos que coincidan con los filtros."
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
        title={editando ? 'Editar gasto' : 'Registrar gasto'}
        description="La tasa se deriva de los montos (Bs ÷ USD). El campo Autorizado por es obligatorio."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!formValido}
              loading={guardarMutation.isPending}
              onClick={() => {
                setFormError(null);
                guardarMutation.mutate();
              }}
            >
              {editando ? 'Guardar cambios' : 'Registrar gasto'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fecha">Fecha *</Label>
              <Input id="fecha" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat">Categoría *</Label>
              <Select id="cat" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="montoBs">Monto Bs *</Label>
              <Input id="montoBs" inputMode="decimal" value={form.montoBs} onChange={(e) => setForm({ ...form, montoBs: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="montoUsd">Monto USD *</Label>
              <Input id="montoUsd" inputMode="decimal" value={form.montoUsd} onChange={(e) => setForm({ ...form, montoUsd: e.target.value })} />
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            Tasa derivada:{' '}
            <span className="font-semibold tabular-nums">{tasaPreview !== null ? formatRate(tasaPreview) : '—'}</span>{' '}
            Bs/USD
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción *</Label>
            <Textarea id="descripcion" rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="autorizadoPor">Autorizado por * (texto libre)</Label>
            <Input
              id="autorizadoPor"
              placeholder="Nombre de quien autorizó el gasto"
              value={form.autorizadoPor}
              onChange={(e) => setForm({ ...form, autorizadoPor: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referencia">Referencia del movimiento (opcional)</Label>
            <Input id="referencia" value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="soporte">Soporte (imagen o PDF, opcional)</Label>
            <input
              id="soporte"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setSoporteFile(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-md border border-input bg-background text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent"
            />
            {soporteFile && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Upload className="h-3 w-3" />
                {soporteFile.name}
              </p>
            )}
          </div>

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
        onConfirm={() => eliminarTarget && eliminarMutation.mutate(eliminarTarget.id)}
        title="Eliminar gasto"
        description="Esta acción es irreversible. ¿Confirma que desea eliminar el gasto?"
        confirmLabel="Eliminar"
        destructive
        loading={eliminarMutation.isPending}
      />

      <FilePreviewDialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        titulo="Soporte del gasto"
        soporteUrl={preview?.url ?? null}
        nombreArchivo={preview?.nombre}
      />
    </div>
  );
}
