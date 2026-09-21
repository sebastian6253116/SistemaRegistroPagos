import { env } from '../config/env';
import { prisma } from './prisma';

/**
 * Typed access to the tunable `parametros` table with a short in-memory cache.
 * Falls back to env defaults when a key is missing, so the system always has a
 * usable value (spec section 5.2 / 5.3).
 */
export interface ConfigValues {
  toleranciaMontoBs: number;
  ventanaDias: number;
  referenciaSufijo: number;
  umbralAntiguedadDias: number;
  maxLoginAttempts: number;
  loginLockMinutes: number;
  cuentaRecaudadoraDefault: number | null;
  tipoPagoDefault: number | null;
  bcvJobHabilitado: boolean;
  bancoOrigenObligatorio: boolean;
}

/** Client-safe subset exposed to the payment form. */
export interface ClientConfigValues {
  cuentaRecaudadoraDefault: number | null;
  tipoPagoDefault: number | null;
  bcvJobHabilitado: boolean;
  bancoOrigenObligatorio: boolean;
}

const DEFAULTS: ConfigValues = {
  toleranciaMontoBs: env.MATCH_AMOUNT_TOLERANCE_BS,
  ventanaDias: env.MATCH_DATE_WINDOW_DAYS,
  referenciaSufijo: env.MATCH_REFERENCE_SUFFIX,
  umbralAntiguedadDias: env.UMBRAL_ANTIGUEDAD_DIAS,
  maxLoginAttempts: env.MAX_LOGIN_ATTEMPTS,
  loginLockMinutes: env.LOGIN_LOCK_MINUTES,
  cuentaRecaudadoraDefault: null,
  tipoPagoDefault: null,
  bcvJobHabilitado: true,
  bancoOrigenObligatorio: true,
};

const PARAM_MAP: Record<keyof ConfigValues, string> = {
  toleranciaMontoBs: 'match.amount_tolerance_bs',
  ventanaDias: 'match.date_window_days',
  referenciaSufijo: 'match.reference_suffix',
  umbralAntiguedadDias: 'cobro.umbral_antiguedad_dias',
  maxLoginAttempts: 'login.max_attempts',
  loginLockMinutes: 'login.lock_minutes',
  cuentaRecaudadoraDefault: 'pago.cuenta_recaudadora_default',
  tipoPagoDefault: 'pago.tipo_pago_default',
  bcvJobHabilitado: 'bcv.job_habilitado',
  bancoOrigenObligatorio: 'pago.banco_origen_obligatorio',
};

/** Keys parsed with the legacy finite-number rule. */
const NUMERIC_KEYS = [
  'toleranciaMontoBs',
  'ventanaDias',
  'referenciaSufijo',
  'umbralAntiguedadDias',
  'maxLoginAttempts',
  'loginLockMinutes',
] as const;

const TRUE_VALUES = new Set(['1', 'true', 'si', 'sí']);
const FALSE_VALUES = new Set(['0', 'false', 'no']);

/** Accepts only a positive integer id, otherwise null. */
function parsePositiveInt(raw: string | undefined): number | null {
  if (raw == null) return null;
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/** Parses the common boolean encodings, falling back when unrecognized. */
function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

const CACHE_TTL_MS = 30_000;
let cache: { values: ConfigValues; expiresAt: number } | null = null;

export async function getConfigValues(force = false): Promise<ConfigValues> {
  if (!force && cache && cache.expiresAt > Date.now()) {
    return cache.values;
  }

  // The documented contract is to fall back to env defaults, so a failed read
  // must NOT propagate: an unguarded `findMany` turned a transient DB error into
  // an opaque 500 for every caller. Log and treat it as "no override present".
  let rows: Awaited<ReturnType<typeof prisma.parametro.findMany>> = [];
  let leidoOk = true;
  try {
    rows = await prisma.parametro.findMany({
      where: { clave: { in: Object.values(PARAM_MAP) } },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to read parametros; falling back to env defaults:', err);
    rows = [];
    leidoOk = false;
  }
  const byClave = new Map(rows.map((r) => [r.clave, r.valor]));

  const values = { ...DEFAULTS };
  for (const key of NUMERIC_KEYS) {
    const raw = byClave.get(PARAM_MAP[key]);
    const num = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(num)) values[key] = num;
  }
  values.cuentaRecaudadoraDefault = parsePositiveInt(
    byClave.get(PARAM_MAP.cuentaRecaudadoraDefault),
  );
  values.tipoPagoDefault = parsePositiveInt(byClave.get(PARAM_MAP.tipoPagoDefault));
  values.bcvJobHabilitado = parseBoolean(
    byClave.get(PARAM_MAP.bcvJobHabilitado),
    DEFAULTS.bcvJobHabilitado,
  );
  values.bancoOrigenObligatorio = parseBoolean(
    byClave.get(PARAM_MAP.bancoOrigenObligatorio),
    DEFAULTS.bancoOrigenObligatorio,
  );

  // A failed read is NOT cached: caching the defaults for 30s would hide the
  // transient failure and delay recovery. The next call retries the read.
  if (leidoOk) cache = { values, expiresAt: Date.now() + CACHE_TTL_MS };
  return values;
}

/** Resolved config for the client-safe subset (two defaults + the BCV flag). */
export async function getClientConfigValues(force = false): Promise<ClientConfigValues> {
  const values = await getConfigValues(force);
  return {
    cuentaRecaudadoraDefault: values.cuentaRecaudadoraDefault,
    tipoPagoDefault: values.tipoPagoDefault,
    bcvJobHabilitado: values.bcvJobHabilitado,
    bancoOrigenObligatorio: values.bancoOrigenObligatorio,
  };
}

/** Invalidate the cache after a parameter is updated. */
export function invalidateConfigCache(): void {
  cache = null;
}
