import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  normalizarMonto,
  parsearFecha,
  parseBankFile,
} from '../src/modules/importacion/parser';

function xlsxBuffer(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('normalizarMonto (spec 5.4: acepta coma o punto decimal)', () => {
  it('parses latin format (dot thousands, comma decimals)', () => {
    expect(normalizarMonto('1.234,56')).toBe(1234.56);
    expect(normalizarMonto('1.234.567,89')).toBe(1234567.89);
  });

  it('parses US format (comma thousands, dot decimals)', () => {
    expect(normalizarMonto('1,234.56')).toBe(1234.56);
    expect(normalizarMonto('1234.56')).toBe(1234.56);
  });

  it('parses comma-only decimals', () => {
    expect(normalizarMonto('1234,56')).toBe(1234.56);
    expect(normalizarMonto('3600,00')).toBe(3600);
  });

  it('strips currency symbols and spaces', () => {
    expect(normalizarMonto('Bs. 3.600,00')).toBe(3600);
    expect(normalizarMonto('$ 1,234.56')).toBe(1234.56);
  });

  it('returns null for invalid input', () => {
    expect(normalizarMonto('')).toBeNull();
    expect(normalizarMonto('abc')).toBeNull();
    expect(normalizarMonto(null)).toBeNull();
  });
});

describe('parsearFecha (spec 5.4: dd/mm/yyyy)', () => {
  it('parses dd/mm/yyyy as a UTC-midnight date', () => {
    expect(parsearFecha('19/09/2026')!.toISOString()).toBe('2026-09-19T00:00:00.000Z');
    expect(parsearFecha('01/01/2026')!.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('parses dd-mm-yyyy and yyyy-mm-dd', () => {
    expect(parsearFecha('19-09-2026')!.toISOString()).toBe('2026-09-19T00:00:00.000Z');
    expect(parsearFecha('2026-09-19')!.toISOString()).toBe('2026-09-19T00:00:00.000Z');
  });

  it('expands 2-digit years', () => {
    expect(parsearFecha('19/09/26')!.toISOString()).toBe('2026-09-19T00:00:00.000Z');
  });

  it('returns null for invalid dates', () => {
    expect(parsearFecha('32/13/2026')).toBeNull();
    expect(parsearFecha('not-a-date')).toBeNull();
    expect(parsearFecha('')).toBeNull();
  });
});

describe('parseBankFile', () => {
  const rows = [
    ['12345678', 3600, '19/09/2026'],
    ['98765432', '1.800,00', '19/09/2026'],
    ['55512345', '1.234,56', '18/09/2026'],
  ];

  it('parses xlsx rows into normalized records', () => {
    const result = parseBankFile(xlsxBuffer(rows), 'mov.xlsx');
    expect(result.filasTotales).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].referencia).toBe('12345678');
    expect(result.rows[0].montoBs.toString()).toBe('3600');
    expect(result.rows[0].fechaEjecucion.toISOString()).toBe('2026-09-19T00:00:00.000Z');
    expect(result.rows[2].montoBs.toString()).toBe('1234.56');
  });

  it('skips a header row when requested', () => {
    const withHeader = [['referencia', 'monto', 'fecha'], ...rows];
    const result = parseBankFile(xlsxBuffer(withHeader), 'mov.xlsx', {
      primeraFilaEsEncabezado: true,
    });
    expect(result.filasTotales).toBe(3);
    expect(result.rows[0].referencia).toBe('12345678');
  });

  it('records a bad row with its line number and KEEPS processing the rest', () => {
    const conErrores = [
      ['12345678', 3600, '19/09/2026'],
      ['', 100, '19/09/2026'], // empty reference
      ['55512345', 'abc', '18/09/2026'], // bad amount
      ['66612345', 200, 'no-es-fecha'], // bad date
      ['77712345', 300, '20/09/2026'], // valid after errors
    ];
    const result = parseBankFile(xlsxBuffer(conErrores), 'mov.xlsx');
    expect(result.filasTotales).toBe(5);
    expect(result.rows).toHaveLength(2); // first and last
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].fila).toBe(2); // 1-based line number, no header
    expect(result.errors[1].motivo).toMatch(/Monto/i);
    expect(result.errors[2].motivo).toMatch(/Fecha/i);
    expect(result.rows[1].referencia).toBe('77712345');
  });

  it('skips fully empty rows without counting them as errors', () => {
    const conVacias = [['12345678', 3600, '19/09/2026'], ['', '', ''], ['98765432', 100, '19/09/2026']];
    const result = parseBankFile(xlsxBuffer(conVacias), 'mov.xlsx');
    expect(result.filasTotales).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('parses CSV files too', () => {
    const csv = '12345678,3600.00,19/09/2026\n98765432,1800.00,19/09/2026\n';
    const result = parseBankFile(Buffer.from(csv, 'utf8'), 'mov.csv');
    expect(result.filasTotales).toBe(2);
    expect(result.rows[1].montoBs.toString()).toBe('1800');
  });
});
