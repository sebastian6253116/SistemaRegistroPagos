import { TipoCobro } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  alertaAntiguedadDocumento,
  clasificarPorAntiguedad,
  requiereRevision,
} from '../src/lib/classification';

describe('clasificarPorAntiguedad (spec 5.3)', () => {
  const pago = new Date('2026-09-19T00:00:00.000Z');

  it('classifies a recent document as "nuevo"', () => {
    const doc = new Date('2026-09-10T00:00:00.000Z'); // 9 days
    expect(clasificarPorAntiguedad(doc, pago, 30)).toBe(TipoCobro.nuevo);
  });

  it('classifies a document older than the threshold as "viejo"', () => {
    const doc = new Date('2026-08-01T00:00:00.000Z'); // 49 days
    expect(clasificarPorAntiguedad(doc, pago, 30)).toBe(TipoCobro.viejo);
  });

  it('treats exactly the threshold as "nuevo" (strictly greater is old)', () => {
    const doc = new Date('2026-08-20T00:00:00.000Z'); // exactly 30 days
    expect(clasificarPorAntiguedad(doc, pago, 30)).toBe(TipoCobro.nuevo);
  });

  it('defaults to "nuevo" when there is no document date', () => {
    expect(clasificarPorAntiguedad(null, pago, 30)).toBe(TipoCobro.nuevo);
  });
});

describe('requiereRevision (spec 5.3: never overwrite the collector mark)', () => {
  it('flags a mismatch', () => {
    expect(requiereRevision(TipoCobro.viejo, TipoCobro.nuevo)).toBe(true);
  });
  it('does not flag a match', () => {
    expect(requiereRevision(TipoCobro.nuevo, TipoCobro.nuevo)).toBe(false);
  });
});

describe('alertaAntiguedadDocumento (old document vs. bank movement)', () => {
  const umbral = 30;

  it('returns null when the gap is below the threshold', () => {
    const pago = new Date('2026-09-01T00:00:00.000Z');
    const movimiento = new Date('2026-10-01T00:00:00.000Z'); // 30 days
    expect(alertaAntiguedadDocumento(pago, new Date('2026-09-30T00:00:00.000Z'), umbral)).toBeNull();
    // Boundary: exactly the threshold is NOT flagged (strictly greater is old).
    expect(alertaAntiguedadDocumento(pago, movimiento, umbral)).toBeNull();
  });

  it('returns the day gap when the movement is MORE than the threshold days later', () => {
    const pago = new Date('2026-09-01T00:00:00.000Z');
    const movimiento = new Date('2026-10-02T00:00:00.000Z'); // 31 days
    expect(alertaAntiguedadDocumento(pago, movimiento, umbral)).toBe(31);
  });

  it('uses whole-day (complete 24h) periods for the gap', () => {
    const pago = new Date('2026-09-01T00:00:00.000Z');
    const movimiento = new Date('2026-10-02T12:00:00.000Z'); // 31.5 days
    expect(alertaAntiguedadDocumento(pago, movimiento, umbral)).toBe(31);
  });

  it('returns null when the movement date is missing', () => {
    const pago = new Date('2026-09-01T00:00:00.000Z');
    expect(alertaAntiguedadDocumento(pago, null, umbral)).toBeNull();
    expect(alertaAntiguedadDocumento(pago, undefined, umbral)).toBeNull();
  });

  it('returns null when the payment date is missing', () => {
    const movimiento = new Date('2026-10-02T00:00:00.000Z');
    expect(alertaAntiguedadDocumento(null, movimiento, umbral)).toBeNull();
  });

  it('does not flag a movement on or before the payment date', () => {
    const pago = new Date('2026-09-01T00:00:00.000Z');
    expect(alertaAntiguedadDocumento(pago, new Date('2026-08-20T00:00:00.000Z'), umbral)).toBeNull();
  });
});
