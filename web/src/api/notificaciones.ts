import { api } from './client';
import { cleanParams } from './helpers';
import type { Notificacion, NotificacionPage } from '@/types';

export async function listarNotificaciones(
  params: Record<string, unknown>,
): Promise<NotificacionPage> {
  const { data } = await api.get<NotificacionPage>('/notificaciones', {
    params: cleanParams(params),
  });
  return data;
}

export async function listarNotificacionesNoLeidas(
  params: Record<string, unknown>,
): Promise<NotificacionPage> {
  const { data } = await api.get<NotificacionPage>('/notificaciones/no-leidas', {
    params: cleanParams(params),
  });
  return data;
}

export async function marcarNotificacionLeida(id: number): Promise<Notificacion> {
  const { data } = await api.patch<Notificacion>(`/notificaciones/${id}/leida`, {});
  return data;
}

export async function marcarTodasLeidas(): Promise<void> {
  await api.patch('/notificaciones/leer-todas', {});
}
