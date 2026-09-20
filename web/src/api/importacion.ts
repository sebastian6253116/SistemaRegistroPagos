import { api, downloadFile } from './client';
import { cleanParams } from './helpers';
import type {
  ImportacionResultado,
  LoteImportacion,
  Paginated,
  PreviewImportacion,
} from '@/types';

export async function previewImportacion(
  archivo: File,
  cuentaRecaudadoraId: number,
  primeraFilaEsEncabezado: boolean,
): Promise<PreviewImportacion> {
  const form = new FormData();
  form.append('archivo', archivo);
  const { data } = await api.post<PreviewImportacion>('/importacion/preview', form, {
    params: cleanParams({
      cuentaRecaudadoraId,
      primeraFilaEsEncabezado: String(primeraFilaEsEncabezado),
    }),
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function confirmarImportacion(
  archivo: File,
  cuentaRecaudadoraId: number,
  primeraFilaEsEncabezado: boolean,
): Promise<ImportacionResultado> {
  const form = new FormData();
  form.append('archivo', archivo);
  form.append('cuentaRecaudadoraId', String(cuentaRecaudadoraId));
  form.append('primeraFilaEsEncabezado', String(primeraFilaEsEncabezado));
  const { data } = await api.post<ImportacionResultado>('/importacion/confirmar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function listarLotes(
  params: Record<string, unknown>,
): Promise<Paginated<LoteImportacion>> {
  const { data } = await api.get<Paginated<LoteImportacion>>('/importacion/lotes', {
    params: cleanParams(params),
  });
  return data;
}

export async function obtenerLote(id: number): Promise<LoteImportacion> {
  const { data } = await api.get<LoteImportacion>(`/importacion/lotes/${id}`);
  return data;
}

export async function descargarErroresLote(loteId: number): Promise<void> {
  await downloadFile(`/importacion/lotes/${loteId}/errores`, {}, `errores-lote-${loteId}.csv`);
}

export async function descargarPlantillaImportacion(): Promise<void> {
  await downloadFile(
    '/importacion/plantilla',
    {},
    'plantilla-importacion-bancaria.xlsx',
  );
}
