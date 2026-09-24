import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  actualizarEstadoJobBcv,
  obtenerEstadoJobBcv,
  obtenerTasaBcvActual,
  sincronizarBcv,
} from '@/api/tasasBcv';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_CATALOGS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { formatDateTime, formatRate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

const BCV_STALE_TIME = 5 * 60_000;

export default function TasaBcvTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();
  const puedeEditar = tiene('config.editar');

  const actual = useQuery({
    queryKey: queryKeys.tasaBcvActual(),
    queryFn: obtenerTasaBcvActual,
    staleTime: BCV_STALE_TIME,
    retry: 0,
  });

  const job = useQuery({
    queryKey: queryKeys.bcvJob(),
    queryFn: obtenerEstadoJobBcv,
    staleTime: STALE_CATALOGS,
    retry: 0,
  });

  const intervalo = job.data?.intervaloMinutos ?? 60;

  const guardarJob = useMutation({
    mutationFn: (habilitado: boolean) => actualizarEstadoJobBcv(habilitado),
    onSuccess: (estado) => {
      toast.success(
        estado.habilitado ? 'Consulta automática activada' : 'Consulta automática desactivada',
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.bcvJob() });
    },
    onError: (error) => toast.error('No se pudo actualizar', getApiErrorMessage(error)),
  });

  const sincronizar = useMutation({
    mutationFn: () => sincronizarBcv(),
    onSuccess: (resultado) => {
      if (resultado.insertada) {
        toast.success('Tasa BCV sincronizada');
      } else if (resultado.motivo === 'duplicado') {
        toast.success('La tasa ya estaba actualizada', 'No hay una tasa nueva para registrar.');
      } else if (resultado.motivo === 'sin_cambio') {
        toast.success('La tasa no cambió', 'No se agregó un registro nuevo al historial.');
      } else {
        toast.error(
          'No se pudo sincronizar',
          resultado.error ?? 'La API del BCV no respondió correctamente.',
        );
      }
      queryClient.invalidateQueries({ queryKey: ['tasas-bcv'] });
    },
    onError: (error) => toast.error('No se pudo sincronizar', getApiErrorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Tasa BCV"
        description="Tasa oficial de referencia publicada por el Banco Central de Venezuela y su consulta automática."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Tasa actual</h2>
          {actual.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Cargando…</p>
          ) : actual.isError ? (
            <ErrorState error={actual.error} onRetry={() => actual.refetch()} />
          ) : !actual.data ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Todavía no hay una tasa registrada. Use «Sincronizar ahora» o espere la consulta
              automática.
            </p>
          ) : (
            <div className="mt-3">
              <p className="text-2xl font-semibold tabular-nums">
                {formatRate(actual.data.usd)}{' '}
                <span className="text-sm font-normal text-muted-foreground">Bs/USD</span>
              </p>
              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex gap-1">
                  <dt className="font-medium">Fuente:</dt>
                  <dd>{actual.data.fuente ?? '—'}</dd>
                </div>
                <div className="flex gap-1">
                  <dt className="font-medium">Publicada:</dt>
                  <dd>{formatDateTime(actual.data.fechaApi)}</dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Consulta automática</h2>
          <div className="mt-3 flex items-start justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {job.isLoading
                ? 'Cargando…'
                : job.isError
                  ? 'No se pudo obtener el estado de la consulta automática.'
                  : job.data?.habilitado
                    ? `Activa. Consulta automática cada ${intervalo} minutos.`
                    : `Inactiva. La tasa solo se actualizará al sincronizar manualmente o cada ${intervalo} minutos si se activa.`}
            </p>
            <Switch
              checked={Boolean(job.data?.habilitado)}
              disabled={!puedeEditar || job.isLoading || job.isError}
              loading={guardarJob.isPending}
              onCheckedChange={(checked) => guardarJob.mutate(checked)}
              aria-label="Activar consulta automática de la tasa BCV"
            />
          </div>
          {!puedeEditar && (
            <p className="mt-2 text-xs text-muted-foreground">
              Necesita el permiso «config.editar» para cambiar esta opción.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {puedeEditar && (
              <Button loading={sincronizar.isPending} onClick={() => sincronizar.mutate()}>
                <RefreshCw className="h-4 w-4" />
                Sincronizar ahora
              </Button>
            )}
          </div>
        </section>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        El historial de tasas registradas está disponible en Auditoría → «Historial tasa BCV».
      </p>
    </div>
  );
}
