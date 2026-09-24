import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    tasaBcv: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      create: mocks.create,
    },
  },
}));

import { sincronizar } from '../src/modules/tasas-bcv/tasas-bcv.service';

const PAYLOAD = { id: 'ext-1', date: '2026-09-19T12:00:00.000Z', usd: 37.5, source: 'BCV' };

function stubFetch(impl: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function okResponse(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

function createdRow(apiId: string, usd: string) {
  return {
    id: 1,
    apiId,
    fecha: new Date('2026-09-19T00:00:00.000Z'),
    usd: new Prisma.Decimal(usd),
    fuente: 'BCV',
    fechaApi: new Date('2026-09-19T12:00:00.000Z'),
    createdAt: new Date('2026-09-19T12:00:05.000Z'),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('tasasBcvService.sincronizar', () => {
  it('inserta cuando el apiId no existe y el valor difiere del ultimo', async () => {
    stubFetch(async () => okResponse(PAYLOAD));
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({ usd: new Prisma.Decimal('36.500000') });
    mocks.create.mockResolvedValue(createdRow('ext-1', '37.500000'));

    const result = await sincronizar();

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(result.insertada).toBe(true);
    expect(result.motivo).toBeUndefined();
  });

  it('no inserta cuando el valor es igual al ultimo (misma tasa, distinto apiId)', async () => {
    stubFetch(async () => okResponse(PAYLOAD));
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({ usd: new Prisma.Decimal('37.500000') });

    const result = await sincronizar();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(result).toEqual({ insertada: false, motivo: 'sin_cambio' });
  });

  it('no inserta cuando el apiId ya esta almacenado', async () => {
    stubFetch(async () => okResponse(PAYLOAD));
    mocks.findUnique.mockResolvedValue({ id: 1, apiId: 'ext-1' });

    const result = await sincronizar();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(result).toEqual({ insertada: false, motivo: 'duplicado' });
  });

  it('inserta cuando la tabla esta vacia', async () => {
    stubFetch(async () => okResponse(PAYLOAD));
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue(createdRow('ext-1', '37.500000'));

    const result = await sincronizar();

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(result.insertada).toBe(true);
  });

  it('no inserta cuando el valor upstream tiene mas de 6 decimales y redondea al ultimo', async () => {
    stubFetch(async () => okResponse({ ...PAYLOAD, usd: 849.56412345 }));
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({ usd: new Prisma.Decimal('849.564123') });

    const result = await sincronizar();

    expect(mocks.create).not.toHaveBeenCalled();
    expect(result).toEqual({ insertada: false, motivo: 'sin_cambio' });
  });

  it('inserta cuando el valor upstream redondea a uno distinto del ultimo', async () => {
    stubFetch(async () => okResponse({ ...PAYLOAD, usd: 849.5641236 }));
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({ usd: new Prisma.Decimal('849.564123') });
    mocks.create.mockResolvedValue(createdRow('ext-1', '849.564124'));

    const result = await sincronizar();

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(result.insertada).toBe(true);
  });

  it('devuelve motivo error y no lanza cuando fetch falla', async () => {
    stubFetch(async () => {
      throw new Error('network down');
    });

    const result = await sincronizar();

    expect(result.insertada).toBe(false);
    expect(result.motivo).toBe('error');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
