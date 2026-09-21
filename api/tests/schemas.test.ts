import { describe, expect, it } from 'vitest';
import { montoPositivo } from '../src/lib/schemas';

describe('montoPositivo (shared money validator)', () => {
  it('accepts positive strings and numbers, normalised to 2 decimals', () => {
    expect(montoPositivo.parse('100.00')).toBe('100.00');
    expect(montoPositivo.parse('0.01')).toBe('0.01');
    expect(montoPositivo.parse(20)).toBe('20.00');
    expect(montoPositivo.parse(' 15.5 ')).toBe('15.50');
  });

  it('rounds more than 2 decimals to the DECIMAL(18,2) scale', () => {
    expect(montoPositivo.parse('1.2345')).toBe('1.23');
    expect(montoPositivo.parse(1.239)).toBe('1.24');
  });

  it('rejects zero, negatives and non-numeric values with the shared message', () => {
    for (const bad of ['0', '0.00', 0, '-1', '-0.01', 'abc', '', ' ', '1e3', 'NaN', '0.001']) {
      const res = montoPositivo.safeParse(bad);
      expect(res.success, `expected ${JSON.stringify(bad)} to be rejected`).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toBe('El monto debe ser un numero positivo');
      }
    }
  });
});
