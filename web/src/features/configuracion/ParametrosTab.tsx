import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { actualizarParametro, listarParametros } from '@/api/parametros';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_LISTS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { useDebounce } from '@/hooks/useDebounce';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { ErrorState } from '@/components/common/ErrorState';
import { ClearFiltersButton } from '@/components/common/ClearFiltersButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import type { Parametro } from '@/types';

const PAGE_SIZE = 50;

const BOOLEAN_KEYS = new Set(['pago.banco_origen_obligatorio', 'bcv.job_habilitado']);

const DESCRIPCIONES: Record<string, string> = {
  'match.amount_tolerance_bs': 'Tolerancia en bolívares al cruzar montos (conciliación).',
  'match.date_window_days': 'Ventana de días (±) para la fecha de ejecución.',
  'match.reference_suffix': 'Últimos N dígitos usados para comparar referencias parciales.',
  'cobro.umbral_antiguedad_dias': 'Días para clasificar un cobro como viejo.',
  'login.max_attempts': 'Intentos fallidos antes de bloquear el usuario.',
  'login.lock_minutes': 'Minutos de bloqueo tras superar los intentos.',
  'pago.banco_origen_obligatorio': 'Exigir banco de origen al reportar un pago.',
  'bcv.job_habilitado': 'Consulta automática de la tasa BCV.',
};

export default function ParametrosTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const [editando, setEditando] = useState<Parametro | null>(null);
  const [valor, setValor] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.parametros({ page, pageSize: PAGE_SIZE, search: debounced || undefined }),
    queryFn: () => listarParametros({ page, pageSize: PAGE_SIZE, search: debounced || undefined }),
    staleTime: STALE_LISTS,
  });

  const guardar = useMutation({
    mutationFn: () => {
      if (!editando) throw new Error('Sin parámetro');
      return actualizarParametro(editando.clave, valor.trim(), descripcion.trim() || null);
    },
    onSuccess: () => {
      toast.success('Parámetro actualizado');
      setEditando(null);
      queryClient.invalidateQueries({ queryKey: ['parametros'] });
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });

  const toggle = useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: string }) =>
      actualizarParametro(clave, valor),
    onSuccess: (param) => {
      toast.success(
        'Parámetro actualizado',
        `${DESCRIPCIONES[param.clave] ?? param.clave} ${
          param.valor === '1' ? 'activado' : 'desactivado'
        }.`,
      );
      queryClient.invalidateQueries({ queryKey: ['parametros'] });
    },
    onError: (error) => toast.error('No se pudo actualizar', getApiErrorMessage(error)),
  });

  const columns = useMemo<ColumnDef<Parametro, unknown>[]>(
    () => [
      {
        accessorKey: 'clave',
        header: 'Clave',
        cell: ({ row }) => <code className="text-xs">{row.original.clave}</code>,
      },
      {
        accessorKey: 'valor',
        header: 'Valor',
        cell: ({ row }) => {
          const param = row.original;
          if (BOOLEAN_KEYS.has(param.clave)) {
            return (
              <Switch
                checked={param.valor === '1'}
                disabled={!tiene('config.editar')}
                loading={toggle.isPending && toggle.variables?.clave === param.clave}
                onCheckedChange={(checked) =>
                  toggle.mutate({ clave: param.clave, valor: checked ? '1' : '0' })
                }
                aria-label={DESCRIPCIONES[param.clave] ?? param.clave}
              />
            );
          }
          return <span className="font-semibold tabular-nums">{param.valor}</span>;
        },
      },
      {
        id: 'descripcion',
        header: 'Descripción',
        cell: ({ row }) =>
          row.original.descripcion ?? DESCRIPCIONES[row.original.clave] ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'acciones',
        header: '',
        cell: ({ row }) =>
          tiene('config.editar') && !BOOLEAN_KEYS.has(row.original.clave) ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Editar"
              onClick={() => {
                setEditando(row.original);
                setValor(row.original.valor);
                setDescripcion(row.original.descripcion ?? '');
                setFormError(null);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null,
      },
    ],
    [tiene, toggle],
  );

  return (
    <div>
      <PageHeader
        title="Parámetros del sistema"
        description="Tolerancias de conciliación, ventana de fechas, umbral de antigüedad y política de bloqueo de login."
      />

      <div className="mb-4 flex max-w-sm items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="p-search">Buscar</Label>
          <Input id="p-search" placeholder="Clave o descripción" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
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
          getRowId={(r) => r.clave}
          mobileCard={(row) => (
            <div className="space-y-2">
              <code className="block break-words text-xs font-medium">{row.clave}</code>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Valor</p>
                  {BOOLEAN_KEYS.has(row.clave) ? (
                    <Switch
                      checked={row.valor === '1'}
                      disabled={!tiene('config.editar')}
                      loading={toggle.isPending && toggle.variables?.clave === row.clave}
                      onCheckedChange={(checked) =>
                        toggle.mutate({ clave: row.clave, valor: checked ? '1' : '0' })
                      }
                      aria-label={DESCRIPCIONES[row.clave] ?? row.clave}
                    />
                  ) : (
                    <p className="font-semibold tabular-nums">{row.valor}</p>
                  )}
                </div>
                {tiene('config.editar') && !BOOLEAN_KEYS.has(row.clave) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditando(row);
                      setValor(row.valor);
                      setDescripcion(row.descripcion ?? '');
                      setFormError(null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {row.descripcion ?? DESCRIPCIONES[row.clave] ?? '—'}
              </p>
            </div>
          )}
          emptyTitle="Sin parámetros"
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
        open={editando !== null}
        onClose={() => setEditando(null)}
        title="Editar parámetro"
        description={editando ? DESCRIPCIONES[editando.clave] : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button disabled={!valor.trim()} loading={guardar.isPending} onClick={() => { setFormError(null); guardar.mutate(); }}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Clave</Label>
            <Input value={editando?.clave ?? ''} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-valor">Valor *</Label>
            <Input id="p-valor" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Descripción</Label>
            <Textarea id="p-desc" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          {formError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
        </div>
      </Dialog>
    </div>
  );
}
