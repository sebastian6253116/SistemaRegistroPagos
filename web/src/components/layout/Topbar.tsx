import { LogOut, Menu, Moon, Sun, UserCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { obtenerTasaBcvActual } from '@/api/tasasBcv';
import { queryKeys } from '@/lib/queryClient';
import { formatDateTime, formatRate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel';

/** Informational BCV rate: refreshed at most every 5 minutes, never an error state. */
const BCV_STALE_TIME = 5 * 60_000;

function BcvRateIndicator() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.tasaBcvActual(),
    queryFn: obtenerTasaBcvActual,
    staleTime: BCV_STALE_TIME,
    retry: 0,
  });

  // Informativa y de solo lectura. Visible también en móvil en formato compacto:
  // la etiqueta "BCV" y el valor se mantienen; la unidad Bs/USD se reserva para
  // pantallas más anchas.
  if (isLoading) {
    return <Skeleton className="h-9 w-16 rounded-lg sm:w-28" />;
  }

  if (!data || !data.usd) return null;

  return (
    <div
      className="flex items-center gap-1 whitespace-nowrap rounded-lg border px-1.5 py-1.5 sm:gap-1.5 sm:px-2.5"
      title={`Tasa BCV · ${formatDateTime(data.fechaApi)}`}
    >
      <span className="text-[11px] font-semibold text-muted-foreground">BCV</span>
      <span className="text-[11px] font-medium tabular-nums sm:text-xs">
        {formatRate(data.usd)}
      </span>
      <span className="hidden text-[11px] text-muted-foreground sm:inline">Bs/USD</span>
    </div>
  );
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await logout();
    setLoading(false);
    setConfirmOpen(false);
  }

  const themeLabel = theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:gap-3 sm:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="hidden sm:block">
          <p className="text-sm font-semibold">Sistema de Gestión de Cobros</p>
          <p className="text-xs text-muted-foreground">
            Todos los montos expresados en USD salvo indicación contraria
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <BcvRateIndicator />
        <NotificationsPanel />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={themeLabel}
          title={themeLabel}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        <div
          className="flex items-center gap-2 rounded-lg border px-1.5 py-1.5 sm:px-3"
          title={user?.nombreCompleto ?? undefined}
        >
          <UserCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="hidden leading-tight sm:block">
            <p className="max-w-[10rem] truncate text-sm font-medium">{user?.nombreCompleto}</p>
            <p className="text-xs text-muted-foreground">{user?.rol}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Salir</span>
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Cerrar sesión"
        description="¿Está seguro que desea salir del sistema?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={loading} onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </>
        }
      />
    </header>
  );
}
