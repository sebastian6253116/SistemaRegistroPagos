import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('../src/lib/prisma', () => ({
  prisma: { parametro: { findMany } },
}));

import { getConfigValues, invalidateConfigCache } from '../src/lib/config-values';

describe('getConfigValues fallback (documented contract)', () => {
  beforeEach(() => {
    findMany.mockReset();
    invalidateConfigCache();
  });

  it('falls back to env defaults when the parametros read fails instead of throwing', async () => {
    findMany.mockRejectedValueOnce(new Error('db down'));

    const values = await getConfigValues(true);

    expect(values.toleranciaMontoBs).toBe(env.MATCH_AMOUNT_TOLERANCE_BS);
    expect(values.ventanaDias).toBe(env.MATCH_DATE_WINDOW_DAYS);
    expect(values.bancoOrigenObligatorio).toBe(true);
    expect(values.bcvJobHabilitado).toBe(true);
  });

  it('keeps the existing parsing semantics when the read succeeds', async () => {
    findMany.mockResolvedValueOnce([
      { clave: 'match.amount_tolerance_bs', valor: '5' },
      { clave: 'pago.banco_origen_obligatorio', valor: 'false' },
      { clave: 'pago.cuenta_recaudadora_default', valor: '12' },
    ]);

    const values = await getConfigValues(true);

    expect(values.toleranciaMontoBs).toBe(5);
    expect(values.bancoOrigenObligatorio).toBe(false);
    expect(values.cuentaRecaudadoraDefault).toBe(12);
  });

  it('serves the cached values for 30s after a successful read', async () => {
    findMany.mockResolvedValueOnce([{ clave: 'match.amount_tolerance_bs', valor: '7' }]);

    const first = await getConfigValues();
    const second = await getConfigValues();

    expect(first.toleranciaMontoBs).toBe(7);
    expect(second.toleranciaMontoBs).toBe(7);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
