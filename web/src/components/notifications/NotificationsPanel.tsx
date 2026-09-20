import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import {
  listarNotificaciones,
  listarNotificacionesNoLeidas,
  marcarNotificacionLeida,
  marcarTodasLeidas,
} from '@/api/notificaciones';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_LISTS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import type { Notificacion } from '@/types';

const PANEL_PAGE_SIZE = 20;
/** No websocket: poll the unread badge every 60s so new items appear on their own. */
const UNREAD_POLL_MS = 60_000;

export function NotificationsPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { tiene } = usePermiso();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const noLeidasQuery = useQuery({
    queryKey: queryKeys.notificacionesNoLeidas(),
    queryFn: () => listarNotificacionesNoLeidas({ page: 1, pageSize: 1 }),
    refetchInterval: UNREAD_POLL_MS,
    staleTime: STALE_LISTS,
    retry: 0,
  });
  const noLeidas = noLeidasQuery.data?.noLeidas ?? 0;

  const listaQuery = useQuery({
    queryKey: queryKeys.notificaciones({ page: 1, pageSize: PANEL_PAGE_SIZE }),
    queryFn: () => listarNotificaciones({ page: 1, pageSize: PANEL_PAGE_SIZE }),
    enabled: open,
    staleTime: STALE_LISTS,
    retry: 0,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function goToPayment() {
    navigate(tiene('pagos.validar') ? '/validacion' : '/mis-pagos');
    setOpen(false);
  }

  const marcarLeida = useMutation({
    mutationFn: (id: number) => marcarNotificacionLeida(id),
    onSuccess: (notificacion) => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      if (notificacion.entidad === 'pago') goToPayment();
    },
    onError: (error) => toast.error('No se pudo marcar como leída', getApiErrorMessage(error)),
  });

  const marcarTodas = useMutation({
    mutationFn: () => marcarTodasLeidas(),
    onSuccess: () => {
      toast.success('Notificaciones marcadas como leídas');
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
    },
    onError: (error) => toast.error('No se pudieron marcar', getApiErrorMessage(error)),
  });

  function handleSelect(notificacion: Notificacion) {
    if (notificacion.leida) {
      if (notificacion.entidad === 'pago') goToPayment();
      return;
    }
    marcarLeida.mutate(notificacion.id);
  }

  const ariaLabel = `Notificaciones${noLeidas > 0 ? `, ${noLeidas} sin leer` : ''}`;

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell className="h-5 w-5" />
        {noLeidas > 0 && (
          <Badge
            variant="destructive"
            className="absolute -right-0.5 -top-0.5 h-5 min-w-[1.25rem] justify-center px-1 text-[10px] leading-none"
          >
            {noLeidas > 9 ? '9+' : noLeidas}
          </Badge>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className={cn(
            'fixed inset-x-3 top-16 z-40 overflow-hidden rounded-lg border bg-background shadow-lg',
            'sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <p className="text-sm font-semibold">Notificaciones</p>
            {noLeidas > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={marcarTodas.isPending}
                onClick={() => marcarTodas.mutate()}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas como leídas
              </Button>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto sm:max-h-96">
            {listaQuery.isLoading ? (
              <div className="space-y-3 p-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : listaQuery.isError ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No se pudieron cargar las notificaciones.
              </p>
            ) : (listaQuery.data?.data.length ?? 0) === 0 ? (
              <EmptyState title="No tiene notificaciones" />
            ) : (
              <ul className="divide-y">
                {listaQuery.data?.data.map((notificacion) => (
                  <li key={notificacion.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(notificacion)}
                      className={cn(
                        'flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                        !notificacion.leida && 'bg-primary/5',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          notificacion.leida ? 'bg-transparent' : 'bg-primary',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block break-words text-sm',
                            !notificacion.leida && 'font-semibold',
                          )}
                        >
                          {notificacion.titulo}
                        </span>
                        <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                          {notificacion.mensaje}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {formatDateTime(notificacion.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
