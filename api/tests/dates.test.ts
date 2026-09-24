import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { esFechaFutura, hoyCaracas, sumarDias } from '../src/lib/dates';

describe('hoyCaracas / esFechaFutura (business calendar dates)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags only dates STRICTLY after business today as future', () => {
    vi.setSystemTime(new Date('2026-09-24T12:00:00.000Z')); // Caracas = 2026-09-24

    expect(esFechaFutura(new Date('2026-09-25T00:00:00.000Z'))).toBe(true);
    expect(esFechaFutura(new Date('2026-09-24T00:00:00.000Z'))).toBe(false);
    expect(esFechaFutura(new Date('2026-09-23T00:00:00.000Z'))).toBe(false);
  });

  it('keeps the same business today across the UTC rollover', () => {
    vi.setSystemTime(new Date('2026-09-25T02:00:00.000Z')); // Caracas = 2026-09-24

    expect(hoyCaracas()).toBe('2026-09-24');
    // A DATE read at UTC midnight is compared by its UTC calendar day, so the
    // next UTC day is future even though Caracas has not crossed midnight yet.
    expect(esFechaFutura(new Date('2026-09-25T00:00:00.000Z'))).toBe(true);
    expect(esFechaFutura(new Date('2026-09-24T00:00:00.000Z'))).toBe(false);
  });
});

describe('sumarDias (calendar-day arithmetic)', () => {
  it('rolls over month boundaries', () => {
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('goes backwards', () => {
    expect(sumarDias('2026-09-24', -1)).toBe('2026-09-23');
  });
});
