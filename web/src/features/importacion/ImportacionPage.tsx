import { useMemo, useRef, useState, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileCheck2, FileSpreadsheet, Upload } from 'lucide-react';
import {
  confirmarImportacion,
  descargarErroresLote,
  descargarPlantillaImportacion,
  listarLotes,
  previewImportacion,
} from '@/api/importacion';
import { getCatalogoFormPago } from '@/api/pagos';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_CATALOGS, STALE_LISTS } from '@/lib/queryClient';
import { formatDateTime, formatNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ErrorState } from '@/components/common/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import type { ImportacionResultado, LoteImportacion, PreviewImportacion } from '@/types';

const PAGE_SIZE = 10;

type PreviewFila = PreviewImportacion['filas'][number];

export default function ImportacionPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [cuentaRecaudadoraId, setCuentaRecaudadoraId] = useState('');
  const [primeraFilaEsEncabezado, setPrimeraFilaEsEncabezado] = useState(true);
  const [preview, setPreview] = useState<PreviewImportacion | null>(null);
  const [resultado, setResultado] = useState<ImportacionResultado | null>(null);
  const [lotePage, setLotePage] = useState(1);

  const catalogos = useQuery({
    queryKey: queryKeys.catalogoFormPago(),
    queryFn: getCatalogoFormPago,
    staleTime: STALE_CATALOGS,
  });

  const lotes = useQuery({
    queryKey: queryKeys.lotes({ page: lotePage, pageSize: PAGE_SIZE }),
    queryFn: () => listarLotes({ page: lotePage, pageSize: PAGE_SIZE }),
    staleTime: STALE_LISTS,
  });

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!archivo || !cuentaRecaudadoraId) throw new Error('Datos incompletos');
      return previewImportacion(archivo, Number(cuentaRecaudadoraId), primeraFilaEsEncabezado);
    },
    onSuccess: (data) => {
      setPreview(data);
      setResultado(null);
    },
    onError: (error) => toast.error('No se pudo previsualizar', getApiErrorMessage(error)),
  });

  const confirmarMutation = useMutation({
    mutationFn: () => {
      if (!archivo || !cuentaRecaudadoraId) throw new Error('Datos incompletos');
      return confirmarImportacion(archivo, Number(cuentaRecaudadoraId), primeraFilaEsEncabezado);
    },
    onSuccess: (data) => {
      setResultado(data);
      setPreview(null);
      toast.success(
        'Importación completada',
        `${formatNumber(data.insertadas)} filas insertadas, ${formatNumber(data.duplicadas)} duplicadas.`,
      );
      queryClient.invalidateQueries({ queryKey: ['importacion'] });
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      setArchivo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error) => toast.error('No se pudo importar', getApiErrorMessage(error)),
  });

  const loteColumns = useMemo<ColumnDef<LoteImportacion, unknown>[]>(
    () => [
      { accessorKey: 'nombreArchivo', header: 'Archivo' },
      {
        accessorKey: 'createdAt',
        header: 'Fecha',
        cell: ({ row }) => formatDateTime(row.original.createdAt),
      },
      {
        id: 'usuario',
        header: 'Usuario',
        cell: ({ row }) => row.original.usuario.nombreCompleto,
      },
      { accessorKey: 'filasTotales', header: 'Leídas', cell: ({ row }) => formatNumber(row.original.filasTotales) },
      { accessorKey: 'insertadas', header: 'Insertadas', cell: ({ row }) => formatNumber(row.original.insertadas) },
      { accessorKey: 'duplicadas', header: 'Duplicadas', cell: ({ row }) => formatNumber(row.original.duplicadas) },
      {
        accessorKey: 'conError',
        header: 'Con error',
        cell: ({ row }) =>
          row.original.conError > 0 ? (
            <Badge variant="destructive">{formatNumber(row.original.conError)}</Badge>
          ) : (
            <Badge variant="success">0</Badge>
          ),
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) =>
          row.original.conError > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => descargarErroresLote(row.original.id).catch(() => toast.error('No se pudo descargar'))}
            >
              <Download className="h-4 w-4" />
              Errores
            </Button>
          ) : null,
      },
    ],
    [toast],
  );

  const previewColumns = useMemo<ColumnDef<PreviewFila, unknown>[]>(
    () => [
      { accessorKey: 'fila', header: 'Fila', enableSorting: false },
      { accessorKey: 'referencia', header: 'Referencia', enableSorting: false },
      {
        accessorKey: 'montoBs',
        header: 'Monto Bs',
        enableSorting: false,
        cell: ({ row }) => <span className="tabular-nums">{row.original.montoBs}</span>,
      },
      {
        accessorKey: 'fechaEjecucion',
        header: 'Fecha ejecución',
        enableSorting: false,
        cell: ({ row }) => row.original.fechaEjecucion.slice(0, 10),
      },
    ],
    [],
  );

  const puedePrevisualizar = Boolean(archivo && cuentaRecaudadoraId);

  return (
    <div>
      <PageHeader
        title="Importación bancaria"
        description="Cargue el estado de cuenta del banco (.xlsx o .csv) y concilie los pagos reportados."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              Cargar archivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cuenta">Cuenta recaudadora destino *</Label>
              <Select
                id="cuenta"
                value={cuentaRecaudadoraId}
                onChange={(e) => {
                  setCuentaRecaudadoraId(e.target.value);
                  setPreview(null);
                  setResultado(null);
                }}
              >
                <option value="">Seleccione…</option>
                {catalogos.data?.cuentasRecaudadoras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.banco.nombre} — {c.numeroCuenta}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="archivo">Archivo *</Label>
              <InputFile
                inputRef={fileInputRef}
                onChange={(file) => {
                  setArchivo(file);
                  setPreview(null);
                  setResultado(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Columnas: A) Referencia, B) Monto en Bs, C) Fecha de ejecución. Máx. 10 MB.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  descargarPlantillaImportacion().catch(() =>
                    toast.error('No se pudo descargar la plantilla'),
                  )
                }
              >
                <Download className="h-4 w-4" />
                Descargar plantilla
              </Button>
              <p className="text-xs text-muted-foreground">
                Reemplace o elimine la fila de ejemplo antes de importar: los movimientos
                importados no se pueden eliminar desde la aplicación.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={primeraFilaEsEncabezado}
                onChange={(e) => {
                  setPrimeraFilaEsEncabezado(e.target.checked);
                  setPreview(null);
                }}
              />
              La primera fila es encabezado
            </label>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                disabled={!puedePrevisualizar}
                loading={previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Previsualizar
              </Button>
              <Button
                disabled={!preview || confirmarMutation.isPending}
                loading={confirmarMutation.isPending}
                onClick={() => confirmarMutation.mutate()}
              >
                <FileCheck2 className="h-4 w-4" />
                Confirmar importación
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {resultado && (
            <Card className="border-success/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-success">
                  <FileCheck2 className="h-4 w-4" />
                  Importación completada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <ResumenItem label="Filas leídas" value={resultado.filasTotales} />
                  <ResumenItem label="Insertadas" value={resultado.insertadas} tone="success" />
                  <ResumenItem label="Duplicadas" value={resultado.duplicadas} tone="warning" />
                  <ResumenItem label="Con error" value={resultado.conError} tone="destructive" />
                </div>
                {resultado.conError > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() =>
                      descargarErroresLote(resultado.loteId).catch(() =>
                        toast.error('No se pudo descargar el detalle'),
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                    Descargar detalle de errores
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Vista previa</CardTitle>
            </CardHeader>
            <CardContent>
              {!preview ? (
                <EmptyState
                  icon={<FileSpreadsheet className="h-6 w-6" />}
                  title="Sin vista previa"
                  description="Seleccione la cuenta y el archivo, luego pulse Previsualizar."
                />
              ) : (
                <>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {formatNumber(preview.filasTotales)} filas detectadas ·{' '}
                    {formatNumber(preview.erroresDeteccion)} con error de detección. Se muestran las
                    primeras {preview.filas.length}.
                  </p>
                  <DataTable
                    columns={previewColumns}
                    data={preview.filas}
                    getRowId={(f) => String(f.fila)}
                    mobileCard={(f) => (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate font-medium">{f.referencia}</p>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            Fila {f.fila}
                          </span>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Monto Bs</dt>
                            <dd className="tabular-nums">{f.montoBs}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Fecha ejecución</dt>
                            <dd>{f.fechaEjecucion.slice(0, 10)}</dd>
                          </div>
                        </dl>
                      </div>
                    )}
                    emptyTitle="Sin filas para previsualizar"
                  />
                  {preview.errores.length > 0 && (
                    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-sm font-medium text-destructive">Errores de detección</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {preview.errores.map((e) => (
                          <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Historial de lotes</h2>
        {lotes.isError ? (
          <ErrorState error={lotes.error} onRetry={() => lotes.refetch()} />
        ) : (
          <DataTable
            columns={loteColumns}
            data={lotes.data?.data ?? []}
            isLoading={lotes.isLoading}
            getRowId={(row) => String(row.id)}
            mobileCard={(row) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.nombreArchivo}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</p>
                  </div>
                  {row.conError > 0 ? (
                    <Badge variant="destructive">{formatNumber(row.conError)} con error</Badge>
                  ) : (
                    <Badge variant="success">Sin errores</Badge>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Usuario</dt>
                    <dd className="truncate">{row.usuario.nombreCompleto}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Leídas</dt>
                    <dd className="tabular-nums">{formatNumber(row.filasTotales)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Insertadas</dt>
                    <dd className="tabular-nums">{formatNumber(row.insertadas)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Duplicadas</dt>
                    <dd className="tabular-nums">{formatNumber(row.duplicadas)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Con error</dt>
                    <dd className="tabular-nums">{formatNumber(row.conError)}</dd>
                  </div>
                </dl>
                {row.conError > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      descargarErroresLote(row.id).catch(() =>
                        toast.error('No se pudo descargar'),
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                    Descargar errores
                  </Button>
                )}
              </div>
            )}
            emptyTitle="Sin importaciones"
            emptyDescription="Aún no se ha importado ningún archivo del banco."
            pagination={
              lotes.data
                ? {
                    page: lotes.data.meta.page,
                    pageSize: lotes.data.meta.pageSize,
                    total: lotes.data.meta.total,
                    totalPages: lotes.data.meta.totalPages,
                    onPageChange: setLotePage,
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

function ResumenItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'warning' | 'destructive';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'destructive'
          ? 'text-destructive'
          : 'text-foreground';
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${toneClass}`}>{formatNumber(value)}</p>
    </div>
  );
}

function InputFile({
  inputRef,
  onChange,
}: {
  inputRef: RefObject<HTMLInputElement>;
  onChange: (file: File | null) => void;
}) {
  return (
    <input
      ref={inputRef}
      id="archivo"
      type="file"
      accept=".xlsx,.xls,.csv"
      onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      className="block w-full cursor-pointer rounded-md border border-input bg-background text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent"
    />
  );
}
