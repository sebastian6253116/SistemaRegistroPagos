/**
 * Formato y utilidades numéricas/de fecha con locale es-VE.
 * Reglas del negocio: dinero 2 decimales, tasas 6 decimales, fechas dd/mm/yyyy.
 */

const LOCALE = 'es-VE';

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const moneyFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const rateFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});

const intFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

export function formatMoney(value: string | number | null | undefined): string {
  return moneyFormatter.format(toNumber(value));
}

export function formatUsd(value: string | number | null | undefined): string {
  return `${formatMoney(value)} USD`;
}

export function formatBs(value: string | number | null | undefined): string {
  return `${formatMoney(value)} Bs`;
}

export function formatRate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return rateFormatter.format(toNumber(value));
}

export function formatNumber(value: string | number | null | undefined): string {
  return intFormatter.format(toNumber(value));
}

export function formatPercent(
  value: string | number | null | undefined,
  decimals = 2,
): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${toNumber(value).toFixed(decimals)} %`;
}

/** Parsea "YYYY-MM-DD" o ISO como fecha de calendario sin corrimiento de zona. */
export function parseCalendarDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const iso = value.length === 10 ? `${value}T00:00:00` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = parseCalendarDate(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** "YYYY-MM-DD" para inputs type="date" y querystrings. */
export function toInputDate(value: string | Date | null | undefined): string {
  const d = parseCalendarDate(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayInputDate(): string {
  return toInputDate(new Date());
}

/** Antigüedad legible a partir de horas. */
export function formatAntiguedad(horas: number): string {
  if (!horas || horas < 0) return '—';
  if (horas < 24) return `${Math.round(horas)} h`;
  const dias = horas / 24;
  return `${dias.toFixed(1)} d`;
}

/** Tasa derivada = montoBs / montoUsd (solo previsualización; el backend es la fuente). */
export function derivedRate(montoBs: string | number, montoUsd: string | number): number | null {
  const bs = toNumber(montoBs);
  const usd = toNumber(montoUsd);
  if (bs <= 0 || usd <= 0) return null;
  return Math.round((bs / usd) * 1e6) / 1e6;
}

export function truncate(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
