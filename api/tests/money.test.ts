import { describe, expect, it } from 'vitest';
import {
  calcularTasa,
  desviacionPorcentual,
  roundMoney,
  tasaPromedioPonderada,
} from '../src/lib/money';

describe('calcularTasa (spec 5.1)', () => {
  it('derives the rate as monto_bs / monto_usd with 6 decimals', () => {
    // 3600 Bs / 20 USD = 180.000000
    expect(calcularTasa('3600.00', '20.00').toString()).toBe('180');
    expect(calcularTasa(3600, 20).toDecimalPlaces(6).toString()).toBe('180');
  });

  it('rounds to 6 decimals (HALF_UP)', () => {
    // 100 / 3 = 33.333333... -> 33.333333
    expect(calcularTasa('100.00', '3.00').toFixed(6)).toBe('33.333333');
    // 1 / 3 -> 0.333333
    expect(calcularTasa('1.00', '3.00').toFixed(6)).toBe('0.333333');
    // 2 / 3 -> 0.666667 (rounds up)
    expect(calcularTasa('2.00', '3.00').toFixed(6)).toBe('0.666667');
  });

  it('handles decimal inputs without floating point drift', () => {
    // 0.1 + 0.2 style traps: 1234.56 / 10.00 = 123.456000
    expect(calcularTasa('1234.56', '10.00').toFixed(6)).toBe('123.456000');
  });

  it('rejects a non-positive USD amount before dividing', () => {
    expect(() => calcularTasa('100.00', '0')).toThrow(/USD/i);
    expect(() => calcularTasa('100.00', '-1')).toThrow(/USD/i);
  });

  it('rejects a non-positive Bs amount before dividing', () => {
    expect(() => calcularTasa('0', '10')).toThrow(/Bs/i);
    expect(() => calcularTasa('-5', '10')).toThrow(/Bs/i);
  });
});

describe('desviacionPorcentual (informational, spec 5.1)', () => {
  it('computes the percentage deviation vs the reference rate', () => {
    // implicit 180 vs reference 200 -> -10%
    expect(desviacionPorcentual('180', '200')).toBe(-10);
    // implicit 220 vs reference 200 -> +10%
    expect(desviacionPorcentual('220', '200')).toBe(10);
  });

  it('returns null when there is no usable reference', () => {
    expect(desviacionPorcentual('180', null)).toBeNull();
    expect(desviacionPorcentual('180', undefined)).toBeNull();
    expect(desviacionPorcentual('180', '0')).toBeNull();
  });
});

describe('tasaPromedioPonderada', () => {
  it('weights each rate by its USD amount', () => {
    // (20*180 + 80*200) / 100 = (3600 + 16000)/100 = 196
    const value = tasaPromedioPonderada([
      { montoUsd: '20', tasa: '180' },
      { montoUsd: '80', tasa: '200' },
    ]);
    expect(value).toBe(196);
  });

  it('returns null when the total USD is zero', () => {
    expect(tasaPromedioPonderada([])).toBeNull();
    expect(tasaPromedioPonderada([{ montoUsd: '0', tasa: '180' }])).toBeNull();
  });
});

describe('roundMoney', () => {
  it('rounds to 2 decimals', () => {
    expect(roundMoney('10.005').toFixed(2)).toBe('10.01');
    expect(roundMoney('10.004').toFixed(2)).toBe('10.00');
  });
});
