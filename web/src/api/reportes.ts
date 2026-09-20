import { api, downloadFile } from './client';
import { cleanParams } from './helpers';
import type {
  ReporteCobros,
  ReporteFlujoCaja,
  ReporteGastos,
  ReporteMovimientos,
  ReporteNuevoViejo,
  ReportePendientes,
  ReportePorCobrador,
  ReporteTasas,
  TipoReporte,
} from '@/types';

export interface ReporteFiltros {
  fechaDesde?: string;
  fechaHasta?: string;
  cobradorId?: number;
  bancoId?: number;
  estado?: string;
  page?: number;
  pageSize?: number;
}

async function getReporte<T>(tipo: TipoReporte, params: ReporteFiltros): Promise<T> {
  const { data } = await api.get<T>(`/reportes/${tipo}`, {
    params: cleanParams(params as unknown as Record<string, unknown>),
  });
  return data;
}

export const reportesApi = {
  cobros: (p: ReporteFiltros) => getReporte<ReporteCobros>('cobros', p),
  porCobrador: (p: ReporteFiltros) => getReporte<ReportePorCobrador>('por-cobrador', p),
  nuevoViejo: (p: ReporteFiltros) => getReporte<ReporteNuevoViejo>('nuevo-viejo', p),
  tasas: (p: ReporteFiltros) => getReporte<ReporteTasas>('tasas', p),
  pendientes: (p: ReporteFiltros) => getReporte<ReportePendientes>('pendientes', p),
  movimientosNoConciliados: (p: ReporteFiltros) =>
    getReporte<ReporteMovimientos>('movimientos-no-conciliados', p),
  pagosSinRespaldo: (p: ReporteFiltros) => getReporte<ReporteCobros>('pagos-sin-respaldo', p),
  flujoCaja: (p: ReporteFiltros) => getReporte<ReporteFlujoCaja>('flujo-caja', p),
  gastos: (p: ReporteFiltros) => getReporte<ReporteGastos>('gastos', p),
};

export async function exportarReporte(
  tipo: TipoReporte,
  formato: 'excel' | 'pdf',
  filtros: ReporteFiltros,
): Promise<void> {
  const params = cleanParams({ ...filtros, formato } as Record<string, unknown>);
  delete params.page;
  delete params.pageSize;
  const ext = formato === 'pdf' ? 'pdf' : 'xlsx';
  await downloadFile(`/reportes/${tipo}/export`, params, `${tipo}.${ext}`);
}
