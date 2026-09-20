import { api } from './client';
import { cleanParams } from './helpers';
import type {
  CatalogoFormPago,
  CoincidenciasResultado,
  Paginated,
  PagoReportado,
  RevertirPagoInput,
} from '@/types';

export async function getCatalogoFormPago(): Promise<CatalogoFormPago> {
  const { data } = await api.get<CatalogoFormPago>('/catalogos/form-pago');
  return data;
}

export interface ReportarPagoInput {
  fechaPago: string;
  fechaDocumento?: string;
  referencia: string;
  bancoOrigenId?: number;
  cuentaRecaudadoraId: number;
  montoBs: string;
  montoUsd: string;
  cliente?: string;
  concepto?: string;
  tipoCobro: 'nuevo' | 'viejo';
  observaciones?: string;
  tipoPagoId?: number;
  cobradorId?: number;
}

export async function reportarPago(input: ReportarPagoInput): Promise<PagoReportado> {
  const { data } = await api.post<PagoReportado>('/pagos', input);
  return data;
}

export async function listarPagos(
  params: Record<string, unknown>,
): Promise<Paginated<PagoReportado>> {
  const { data } = await api.get<Paginated<PagoReportado>>('/pagos', {
    params: cleanParams(params),
  });
  return data;
}

export async function obtenerPago(id: number): Promise<PagoReportado> {
  const { data } = await api.get<PagoReportado>(`/pagos/${id}`);
  return data;
}

export async function editarPago(
  id: number,
  input: Partial<ReportarPagoInput>,
): Promise<PagoReportado> {
  const { data } = await api.put<PagoReportado>(`/pagos/${id}`, input);
  return data;
}

export async function getCoincidencias(id: number): Promise<CoincidenciasResultado> {
  const { data } = await api.get<CoincidenciasResultado>(`/pagos/${id}/coincidencias`);
  return data;
}

export async function validarPago(
  id: number,
  movimientoBancoId?: number,
): Promise<PagoReportado> {
  const { data } = await api.post<PagoReportado>(`/pagos/${id}/validar`, {
    movimientoBancoId,
  });
  return data;
}

export async function rechazarPago(id: number, motivoRechazo: string): Promise<PagoReportado> {
  const { data } = await api.post<PagoReportado>(`/pagos/${id}/rechazar`, { motivoRechazo });
  return data;
}

export async function marcarDuplicado(id: number): Promise<PagoReportado> {
  const { data } = await api.post<PagoReportado>(`/pagos/${id}/duplicado`, {});
  return data;
}

export async function subirEvidenciaPago(id: number, archivo: File): Promise<PagoReportado> {
  const form = new FormData();
  form.append('soporte', archivo);
  const { data } = await api.post<PagoReportado>(`/pagos/${id}/soporte`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function validarLote(
  items: { pagoReportadoId: number; movimientoBancoId: number }[],
): Promise<{ procesados: number; errores: { pagoReportadoId: number; motivo: string }[] }> {
  const { data } = await api.post('/pagos/validar-lote', { items });
  return data;
}

export async function eliminarPago(id: number): Promise<void> {
  await api.delete(`/pagos/${id}`);
}

export async function revertirPago(
  id: number,
  input: RevertirPagoInput,
): Promise<PagoReportado> {
  const { data } = await api.post<PagoReportado>(`/pagos/${id}/revertir`, input);
  return data;
}
