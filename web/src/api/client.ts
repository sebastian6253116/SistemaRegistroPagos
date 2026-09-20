import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { session } from '@/lib/session';
import type { ApiErrorPayload, AuthResult } from '@/types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = session.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = session.getRefreshToken();
  if (!refreshToken) throw new Error('Sin refresh token');

  // Llamada cruda (sin interceptor) para evitar recursión.
  const { data } = await axios.post<AuthResult>(
    `${API_URL}/auth/refresh`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  );
  session.set(data);
  return data.tokens.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorPayload>) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';
    const isAuthEndpoint =
      url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/reset');

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken();
        const newToken = await refreshPromise;
        refreshPromise = null;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        refreshPromise = null;
        session.clear();
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }

    return Promise.reject(error);
  },
);

/** Extrae un mensaje de error entendible en español desde la API. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as ApiErrorPayload | undefined;
    if (payload?.error?.message) return payload.error.message;
    if (error.code === 'ERR_NETWORK') {
      return 'No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo.';
    }
    return error.message || 'Ocurrió un error inesperado.';
  }
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

/**
 * Con `responseType: 'blob'` los errores de la API llegan como Blob, así que
 * `getApiErrorMessage` no puede leer el JSON. Extrae el mensaje del backend.
 */
async function extractBlobErrorMessage(error: unknown): Promise<string | null> {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data;
  if (!(data instanceof Blob)) return null;
  try {
    const parsed = JSON.parse(await data.text()) as ApiErrorPayload;
    return parsed.error?.message ?? null;
  } catch {
    return null;
  }
}

/**
 * Descarga un archivo privado de la API usando el cliente compartido, de modo
 * que se adjunten el token y el interceptor de refresco 401.
 * El `soporteUrl` almacenado (`/uploads/<archivo>`) se pasa tal cual: el
 * `baseURL` del cliente resuelve `/api/uploads/<archivo>`.
 */
export async function obtenerArchivoPrivado(soporteUrl: string): Promise<Blob> {
  try {
    const response = await api.get<Blob>(soporteUrl, { responseType: 'blob' });
    return response.data;
  } catch (error) {
    const message = await extractBlobErrorMessage(error);
    if (message) throw new Error(message);
    throw error;
  }
}

/** Descarga un blob (exportaciones) respetando las cabeceras de autenticación. */
export async function downloadFile(url: string, params: Record<string, unknown>, fallbackName: string) {
  const response = await api.get(url, { params, responseType: 'blob' });
  const disposition = response.headers['content-disposition'] as string | undefined;
  let filename = fallbackName;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  if (match?.[1]) filename = match[1];

  const blobUrl = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
