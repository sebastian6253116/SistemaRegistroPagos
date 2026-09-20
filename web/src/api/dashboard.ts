import { api } from './client';
import { cleanParams } from './helpers';
import type {
  DashboardNuevoViejo,
  DashboardResumen,
  DashboardSerie,
} from '@/types';

export async function getResumen(fecha?: string): Promise<DashboardResumen> {
  const { data } = await api.get<DashboardResumen>('/dashboard/resumen', {
    params: cleanParams({ fecha }),
  });
  return data;
}

export async function getSerie(dias = 30): Promise<DashboardSerie> {
  const { data } = await api.get<DashboardSerie>('/dashboard/serie', { params: { dias } });
  return data;
}

export async function getNuevoViejo(desde?: string, hasta?: string): Promise<DashboardNuevoViejo> {
  const { data } = await api.get<DashboardNuevoViejo>('/dashboard/nuevo-viejo', {
    params: cleanParams({ desde, hasta }),
  });
  return data;
}
