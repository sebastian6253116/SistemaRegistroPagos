import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ApiError } from '../src/lib/http';

const mocks = vi.hoisted(() => {
  const tx = {
    movimientoBanco: { findUnique: vi.fn(), delete: vi.fn() },
    pagoReportado: { count: vi.fn() },
    conciliacion: { count: vi.fn() },
    auditoria: { create: vi.fn() },
  };
  const auditar = vi.fn();
  const transaction = vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx));

  return { tx, auditar, transaction };
});

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    movimientoBanco: mocks.tx.movimientoBanco,
    pagoReportado: mocks.tx.pagoReportado,
    conciliacion: mocks.tx.conciliacion,
    auditoria: mocks.tx.auditoria,
  },
}));

vi.mock('../src/lib/audit', () => ({
  auditar: mocks.auditar,
  snapshot: (value: unknown) => value,
}));

import * as movimientosService from '../src/modules/movimientos/movimientos.service';

const actor = { usuarioId: 99, ip: '127.0.0.1' };

function movimientoRow(estado: 'no_conciliado' | 'conciliado', loteImportacionId: number | null = null) {
  return {
    id: 1,
    referencia: 'REF-001',
    montoBs: new Prisma.Decimal('100.00'),
    estadoConciliacion: estado,
    loteImportacionId,
  };
}

function sinReferencias() {
  mocks.tx.pagoReportado.count.mockResolvedValue(0);
  mocks.tx.conciliacion.count.mockResolvedValue(0);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (cb: (client: typeof mocks.tx) => unknown) =>
    cb(mocks.tx),
  );
  sinReferencias();
});

describe('movimientosService.eliminarMovimiento', () => {
  it('rechaza con 404 y no borra cuando el movimiento no existe', async () => {
    mocks.tx.movimientoBanco.findUnique.mockResolvedValue(null);

    const error = await movimientosService.eliminarMovimiento(1, actor).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect(mocks.tx.movimientoBanco.delete).not.toHaveBeenCalled();
    expect(mocks.auditar).not.toHaveBeenCalled();
  });

  it('rechaza con 409 y no borra un movimiento conciliado', async () => {
    mocks.tx.movimientoBanco.findUnique.mockResolvedValue(movimientoRow('conciliado'));

    const error = await movimientosService.eliminarMovimiento(1, actor).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toContain('conciliado');
    expect(mocks.tx.movimientoBanco.delete).not.toHaveBeenCalled();
    expect(mocks.auditar).not.toHaveBeenCalled();
  });

  it('borra y audita un movimiento no conciliado sin referencias', async () => {
    mocks.tx.movimientoBanco.findUnique.mockResolvedValue(movimientoRow('no_conciliado'));

    await movimientosService.eliminarMovimiento(1, actor);

    expect(mocks.tx.movimientoBanco.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mocks.auditar).toHaveBeenCalledTimes(1);
    expect(mocks.auditar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: actor.usuarioId,
        entidad: 'movimientos_banco',
        entidadId: 1,
        accion: 'borrar',
      }),
      mocks.tx,
    );
  });

  it('permite borrar un movimiento que provino de un lote de importacion', async () => {
    mocks.tx.movimientoBanco.findUnique.mockResolvedValue(movimientoRow('no_conciliado', 7));

    await movimientosService.eliminarMovimiento(1, actor);

    expect(mocks.tx.movimientoBanco.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mocks.auditar).toHaveBeenCalledTimes(1);
  });

  it('rechaza con 409 cuando existe un pago vinculado aunque el estado diga no_conciliado', async () => {
    mocks.tx.movimientoBanco.findUnique.mockResolvedValue(movimientoRow('no_conciliado'));
    mocks.tx.pagoReportado.count.mockResolvedValue(1);

    const error = await movimientosService.eliminarMovimiento(1, actor).catch((e) => e);

    expect((error as ApiError).status).toBe(409);
    expect(mocks.tx.movimientoBanco.delete).not.toHaveBeenCalled();
    expect(mocks.auditar).not.toHaveBeenCalled();
  });

  it('rechaza con 409 cuando existe una conciliacion aunque el estado diga no_conciliado', async () => {
    mocks.tx.movimientoBanco.findUnique.mockResolvedValue(movimientoRow('no_conciliado'));
    mocks.tx.conciliacion.count.mockResolvedValue(1);

    const error = await movimientosService.eliminarMovimiento(1, actor).catch((e) => e);

    expect((error as ApiError).status).toBe(409);
    expect(mocks.tx.movimientoBanco.delete).not.toHaveBeenCalled();
    expect(mocks.auditar).not.toHaveBeenCalled();
  });

  it('convierte un error de clave foranea (P2003) en un 409 limpio', async () => {
    mocks.tx.movimientoBanco.findUnique.mockResolvedValue(movimientoRow('no_conciliado'));
    mocks.tx.movimientoBanco.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '5.22.0',
      }),
    );

    const error = await movimientosService.eliminarMovimiento(1, actor).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect(mocks.auditar).not.toHaveBeenCalled();
  });
});
