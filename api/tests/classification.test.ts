import { TipoCobro } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  antiguedadEnDias,
  clasificarPorAntiguedad,
  esPagoViejo,
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

describe('antiguedadEnDias (gap between fechaPago and movement fechaEjecucion)', () => {
  const fechaPago = new Date('2026-09-21T00:00:00.000Z');

  it('returns 0 when the payment and the movement are the same day', () => {
    expect(antiguedadEnDias(fechaPago, new Date('2026-09-21T00:00:00.000Z'))).toBe(0);
  });

  it('returns 1 when the movement happened 1 day earlier', () => {
    expect(antiguedadEnDias(fechaPago, new Date('2026-09-20T00:00:00.000Z'))).toBe(1);
  });

  it('returns 2 when the movement happened 2 days earlier', () => {
    expect(antiguedadEnDias(fechaPago, new Date('2026-09-19T00:00:00.000Z'))).toBe(2);
  });

  it('returns a negative value when the movement is later than the reported date (kept signed)', () => {
    expect(antiguedadEnDias(fechaPago, new Date('2026-09-24T00:00:00.000Z'))).toBe(-3);
  });
});

describe('esPagoViejo (a gap of the threshold or more is old)', () => {
  it('treats a threshold of 0 as "everything is old", including a same-day payment', () => {
    // Documented edge case introduced by `>=`: 0 >= 0 is true. The owner's
    // production value is 1, so this only surfaces if the threshold is set to 0.
    expect(esPagoViejo(0, 0)).toBe(true);
    expect(esPagoViejo(1, 0)).toBe(true);
    expect(esPagoViejo(2, 0)).toBe(true);
  });

  it('does not flag a same-day payment with the owner threshold of 1', () => {
    expect(esPagoViejo(0, 1)).toBe(false);
  });

  it('flags a 1-day gap with the owner threshold of 1', () => {
    expect(esPagoViejo(1, 1)).toBe(true);
  });

  it('flags a 2-day gap with a threshold of 1', () => {
    expect(esPagoViejo(2, 1)).toBe(true);
  });

  it('never flags a negative gap (movement executed after the reported date)', () => {
    expect(esPagoViejo(-1, 0)).toBe(false);
    expect(esPagoViejo(-1, 1)).toBe(false);
    expect(esPagoViejo(-3, 1)).toBe(false);
  });

  it('flags exactly the threshold as old and one day below it as not old', () => {
    expect(esPagoViejo(30, 30)).toBe(true);
    expect(esPagoViejo(29, 30)).toBe(false);
  });
});
