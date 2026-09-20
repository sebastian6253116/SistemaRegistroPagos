import { TipoCobro } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { clasificarPorAntiguedad, requiereRevision } from '../src/lib/classification';

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
