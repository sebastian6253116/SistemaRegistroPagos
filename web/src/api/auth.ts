import { api } from './client';
import type { AuthResult, AuthUser } from '@/types';

export async function loginApi(usuario: string, password: string): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/login', { usuario, password });
  return data;
}

export async function meApi(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}

export async function logoutApi(refreshToken: string): Promise<void> {
  await api.post('/auth/logout', { refreshToken });
}

export async function forgotPasswordApi(email: string) {
  const { data } = await api.post<{ message: string; token?: string }>(
    '/auth/forgot-password',
    { email },
  );
  return data;
}

export async function resetPasswordApi(token: string, password: string) {
  const { data } = await api.post<{ message: string }>('/auth/reset-password', {
    token,
    password,
  });
  return data;
}

export async function changePasswordApi(passwordActual: string, passwordNueva: string) {
  const { data } = await api.post<{ message: string }>('/auth/change-password', {
    passwordActual,
    passwordNueva,
  });
  return data;
}
