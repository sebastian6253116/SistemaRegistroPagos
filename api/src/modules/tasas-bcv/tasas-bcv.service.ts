import { Prisma } from '@prisma/client';
import { paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar, snapshot } from '../../lib/audit';
import { getConfigValues, invalidateConfigCache } from '../../lib/config-values';
import { parsearRespuestaBcv } from '../../lib/bcv';
import type { Actor } from '../usuarios/usuarios.service';
import type { HistorialBcvQuery, JobConfigInput } from './tasas-bcv.schema';

const BCV_API_URL = 'https://api.farmavid.com.ve/api/rates';
const BCV_API_TIMEOUT_MS = 15_000;
const JOB_PARAM_KEY = 'bcv.job_habilitado';

/** How often the BCV polling job runs. Owned here; re-exported by the job. */
export const BCV_JOB_INTERVAL_MINUTES = 60;

const tasaBcvSelect = {
  id: true,
  apiId: true,
  fecha: true,
  usd: true,
  fuente: true,
  fechaApi: true,
  createdAt: true,
} satisfies Prisma.TasaBcvSelect;

type TasaBcvPayload = Prisma.TasaBcvGetPayload<{ select: typeof tasaBcvSelect }>;

/** Decimals are serialized as strings to preserve precision in JSON. */
function serializeTasaBcv(tasa: TasaBcvPayload) {
  return {
    id: tasa.id,
    apiId: tasa.apiId,
    fecha: tasa.fecha,
    usd: tasa.usd.toString(),
    fuente: tasa.fuente,
    fechaApi: tasa.fechaApi,
    createdAt: tasa.createdAt,
  };
}

export interface SyncResult {
  insertada: boolean;
  motivo?: 'duplicado' | 'error';
  tasa?: ReturnType<typeof serializeTasaBcv>;
  error?: string;
}

/**
 * Polls the external BCV API once and stores the rate when it is new.
 * Never throws: network/parse failures are returned so the job can log them
 * without crashing the process. Repeated polls are a no-op (dedupe by apiId).
 */
export async function sincronizar(): Promise<SyncResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BCV_API_TIMEOUT_MS);

  try {
    const response = await fetch(BCV_API_URL, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`BCV API responded with HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    const parsed = parsearRespuestaBcv(payload);

    const existente = await prisma.tasaBcv.findUnique({ where: { apiId: parsed.apiId } });
    if (existente) {
      return { insertada: false, motivo: 'duplicado' };
    }

    const row = await prisma.tasaBcv.create({
      data: {
        apiId: parsed.apiId,
        fecha: parsed.fecha,
        usd: new Prisma.Decimal(parsed.usd),
        fuente: parsed.fuente,
        fechaApi: parsed.fechaApi,
      },
      select: tasaBcvSelect,
    });

    return { insertada: true, tasa: serializeTasaBcv(row) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { insertada: false, motivo: 'error', error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/** Latest stored rate by raw API timestamp, or null when the table is empty. */
export async function obtenerActual() {
  const row = await prisma.tasaBcv.findFirst({
    orderBy: { fechaApi: 'desc' },
    select: tasaBcvSelect,
  });
  return row ? serializeTasaBcv(row) : null;
}

export async function historial(input: HistorialBcvQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.TasaBcvWhereInput = {};

  if (input.fechaDesde || input.fechaHasta) {
    where.fecha = {};
    if (input.fechaDesde) where.fecha.gte = input.fechaDesde;
    if (input.fechaHasta) {
      where.fecha.lte = new Date(input.fechaHasta.getTime() + 86_400_000 - 1);
    }
  }

  const [rows, total] = await Promise.all([
    prisma.tasaBcv.findMany({
      where,
      select: tasaBcvSelect,
      orderBy: { fechaApi: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.tasaBcv.count({ where }),
  ]);

  return paginate(rows.map(serializeTasaBcv), total, params);
}

/** Resolved job toggle + fixed polling interval for the configuration screen. */
export async function obtenerJobConfig() {
  const values = await getConfigValues();
  return { habilitado: values.bcvJobHabilitado, intervaloMinutos: BCV_JOB_INTERVAL_MINUTES };
}

/** Persists the job toggle and invalidates the config cache so it applies now. */
export async function actualizarJobConfig(input: JobConfigInput, actor: Actor) {
  const valor = input.habilitado ? '1' : '0';
  const before = await prisma.parametro.findUnique({ where: { clave: JOB_PARAM_KEY } });

  const after = await prisma.parametro.upsert({
    where: { clave: JOB_PARAM_KEY },
    update: { valor },
    create: {
      clave: JOB_PARAM_KEY,
      valor,
      descripcion: 'Habilita la sincronizacion horaria de la tasa BCV',
    },
  });

  invalidateConfigCache();

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'parametros',
    entidadId: after.id,
    accion: 'editar',
    datosAntes: before ? snapshot(before) : undefined,
    datosDespues: snapshot(after),
    ip: actor.ip,
  });

  return { habilitado: after.valor === '1', intervaloMinutos: BCV_JOB_INTERVAL_MINUTES };
}
