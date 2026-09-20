import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';

/**
 * Bank statement parser (spec section 5.4).
 *
 * The file has no guaranteed header. Expected columns:
 *   A -> Referencia
 *   B -> Monto en bolivares
 *   C -> Fecha de ejecucion (dd/mm/yyyy)
 *
 * Accepts .xlsx and .csv and normalizes:
 *   - amounts written with comma or dot decimals ("1.234,56", "1234,56", "1234.56")
 *   - dates in dd/mm/yyyy (also dd-mm-yyyy and yyyy-mm-dd)
 *
 * Pure and side-effect free so it can be unit tested without a database.
 */
export interface ParsedRow {
  fila: number; // 1-based file row number
  referencia: string;
  montoBs: Prisma.Decimal;
  fechaEjecucion: Date; // UTC midnight
}

export interface RowError {
  fila: number;
  motivo: string;
  raw?: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  filasTotales: number;
}

export interface ParseOptions {
  /** When true, the first data row is skipped as a header. */
  primeraFilaEsEncabezado?: boolean;
}

/** Normalizes a Spanish/latin amount string into a number. */
export function normalizarMonto(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;

  let s = String(input).trim();
  if (!s) return null;

  // Strip currency symbols and spaces. Keep digits, separators and minus.
  s = s.replace(/[^0-9.,-]/g, '');
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // Latin style: 1.234,56 -> dots are thousands
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US style: 1,234.56 -> commas are thousands
      s = s.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // Only commas: treat as decimal separator (1234,56)
    s = s.replace(',', '.');
  }
  // Only dots: already numeric (1234.56) or thousands (1.234) — treat dot as decimal.

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parses dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd into a UTC-midnight Date. */
export function parsearFecha(input: unknown): Date | null {
  if (input == null) return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  }

  const s = String(input).trim();
  if (!s) return null;

  // dd/mm/yyyy or dd-mm-yyyy
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let anio = Number(m[3]);
    if (anio < 100) anio += 2000;
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return new Date(Date.UTC(anio, mes - 1, dia));
  }

  // yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    const dia = Number(m[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return new Date(Date.UTC(anio, mes - 1, dia));
  }

  return null;
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Reads a buffer (.xlsx or .csv) into a matrix of raw cell values. */
export function leerMatriz(buffer: Buffer, filename: string): unknown[][] {
  const isCsv = /\.csv$/i.test(filename);
  const workbook = isCsv
    ? XLSX.read(buffer.toString('utf8'), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const sheet = workbook.Sheets[firstSheet];
  // header:1 -> array of arrays
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
}

/**
 * Parses a bank statement file into normalized rows, collecting per-row errors
 * WITHOUT aborting (spec 5.4: one bad row must not stop the import).
 */
export function parseBankFile(
  buffer: Buffer,
  filename: string,
  options: ParseOptions = {},
): ParseResult {
  const matrix = leerMatriz(buffer, filename);
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];

  const startIndex = options.primeraFilaEsEncabezado ? 1 : 0;
  let filasTotales = 0;

  for (let i = startIndex; i < matrix.length; i++) {
    const raw = matrix[i] ?? [];
    const linea = i + 1; // 1-based, matches what a user sees in Excel

    // Skip fully empty rows silently.
    const isEmpty = raw.every((c) => cellToString(c) === '');
    if (isEmpty) continue;

    filasTotales++;

    const referencia = cellToString(raw[0]);
    const montoRaw = raw[1];
    const fechaRaw = raw[2];

    if (!referencia) {
      errors.push({ fila: linea, motivo: 'Referencia vacia', raw: raw.map(cellToString) });
      continue;
    }

    const monto = normalizarMonto(montoRaw);
    if (monto == null || monto <= 0) {
      errors.push({
        fila: linea,
        motivo: `Monto en bolivares invalido: "${cellToString(montoRaw)}"`,
        raw: raw.map(cellToString),
      });
      continue;
    }

    const fecha = parsearFecha(fechaRaw);
    if (!fecha) {
      errors.push({
        fila: linea,
        motivo: `Fecha de ejecucion invalida: "${cellToString(fechaRaw)}"`,
        raw: raw.map(cellToString),
      });
      continue;
    }

    rows.push({
      fila: linea,
      referencia,
      montoBs: new Prisma.Decimal(monto.toFixed(2)),
      fechaEjecucion: fecha,
    });
  }

  return { rows, errors, filasTotales };
}
