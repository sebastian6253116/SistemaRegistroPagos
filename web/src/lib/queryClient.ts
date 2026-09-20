import { QueryClient } from '@tanstack/react-query';

/** Tiempos de frescura: listas 30s, catálogos 60s (spec sección 8). */
export const STALE_LISTS = 30_000;
export const STALE_CATALOGS = 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_LISTS,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const queryKeys = {
  dashboardResumen: (fecha?: string) => ['dashboard', 'resumen', fecha ?? 'hoy'] as const,
  dashboardSerie: (dias: number) => ['dashboard', 'serie', dias] as const,
  dashboardNuevoViejo: (desde?: string, hasta?: string) =>
    ['dashboard', 'nuevo-viejo', desde ?? '', hasta ?? ''] as const,
  pagos: (params: unknown) => ['pagos', params] as const,
  pago: (id: number) => ['pagos', id] as const,
  coincidencias: (id: number) => ['pagos', id, 'coincidencias'] as const,
  movimientos: (params: unknown) => ['movimientos', params] as const,
  lotes: (params: unknown) => ['importacion', 'lotes', params] as const,
  gastos: (params: unknown) => ['gastos', params] as const,
  usuarios: (params: unknown) => ['usuarios', params] as const,
  roles: (params: unknown) => ['roles', params] as const,
  permisosCatalogo: () => ['roles', 'permisos'] as const,
  cobradores: (params: unknown) => ['cobradores', params] as const,
  bancos: (params: unknown) => ['bancos', params] as const,
  cuentas: (params: unknown) => ['cuentas', params] as const,
  tasas: (params: unknown) => ['tasas', params] as const,
  parametros: (params: unknown) => ['parametros', params] as const,
  auditoria: (params: unknown) => ['auditoria', params] as const,
  catalogoFormPago: () => ['catalogos', 'form-pago'] as const,
  tiposPago: (params: unknown) => ['tipos-pago', params] as const,
  notificaciones: (params: unknown) => ['notificaciones', params] as const,
  notificacionesNoLeidas: () => ['notificaciones', 'no-leidas'] as const,
  tasaBcvActual: () => ['tasas-bcv', 'actual'] as const,
  tasaBcvHistorial: (params: unknown) => ['tasas-bcv', 'historial', params] as const,
  bcvJob: () => ['tasas-bcv', 'job'] as const,
  reporte: (tipo: string, params: unknown) => ['reportes', tipo, params] as const,
};
