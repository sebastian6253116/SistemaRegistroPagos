import { describe, expect, it } from 'vitest';
import { parsearRespuestaBcv } from '../src/lib/bcv';

const REAL_PAYLOAD = {
  id: '35715c72-7ac9-475b-b451-2f69995cc9f0',
  date: '2026-09-18T23:50:04.773Z',
  usd: 849.564,
  eur: 974.09309112,
  source: 'BCV',
  createdAt: '2026-09-18T23:50:04.776Z',
};

describe('parsearRespuestaBcv', () => {
  it('parses the real BCV payload', () => {
    const parsed = parsearRespuestaBcv(REAL_PAYLOAD);
    expect(parsed.apiId).toBe('35715c72-7ac9-475b-b451-2f69995cc9f0');
    expect(parsed.usd).toBe('849.564');
    expect(parsed.fuente).toBe('BCV');
    // fecha is the UTC calendar date, time stripped to midnight.
    expect(parsed.fecha.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    // fechaApi keeps the raw timestamp returned by the API.
    expect(parsed.fechaApi.toISOString()).toBe('2026-09-18T23:50:04.773Z');
  });

  it('accepts a numeric-string usd', () => {
    const parsed = parsearRespuestaBcv({ ...REAL_PAYLOAD, usd: '849.564' });
    expect(parsed.usd).toBe('849.564');
  });

  it('sets fuente to null when source is missing or not a string', () => {
    expect(parsearRespuestaBcv({ id: 'x', date: REAL_PAYLOAD.date, usd: 1 }).fuente).toBeNull();
    expect(
      parsearRespuestaBcv({ id: 'x', date: REAL_PAYLOAD.date, usd: 1, source: 5 }).fuente,
    ).toBeNull();
  });

  it('preserves full precision without rounding', () => {
    const parsed = parsearRespuestaBcv({ id: 'x', date: REAL_PAYLOAD.date, usd: 0.1 + 0.2 });
    expect(parsed.usd).toBe(String(0.1 + 0.2));
    expect(parsed.usd).toBe('0.30000000000000004');
  });

  it('throws on a null payload', () => {
    expect(() => parsearRespuestaBcv(null)).toThrow(/object/i);
  });

  it('throws when id is missing or empty', () => {
    expect(() => parsearRespuestaBcv({ date: REAL_PAYLOAD.date, usd: 1 })).toThrow(/id/i);
    expect(() => parsearRespuestaBcv({ id: '  ', date: REAL_PAYLOAD.date, usd: 1 })).toThrow(/id/i);
  });

  it('throws when date is unparseable or missing', () => {
    expect(() => parsearRespuestaBcv({ id: 'x', date: 'not-a-date', usd: 1 })).toThrow(/date/i);
    expect(() => parsearRespuestaBcv({ id: 'x', date: '', usd: 1 })).toThrow(/date/i);
    expect(() => parsearRespuestaBcv({ id: 'x', usd: 1 })).toThrow(/date/i);
  });

  it('throws when usd is <= 0', () => {
    expect(() => parsearRespuestaBcv({ id: 'x', date: REAL_PAYLOAD.date, usd: 0 })).toThrow(/usd/i);
    expect(() => parsearRespuestaBcv({ id: 'x', date: REAL_PAYLOAD.date, usd: -5 })).toThrow(/usd/i);
  });

  it('throws when usd is non-numeric', () => {
    expect(() => parsearRespuestaBcv({ id: 'x', date: REAL_PAYLOAD.date, usd: 'abc' })).toThrow(
      /usd/i,
    );
  });

  it('throws when usd is missing', () => {
    expect(() => parsearRespuestaBcv({ id: 'x', date: REAL_PAYLOAD.date })).toThrow(/usd/i);
  });
});
