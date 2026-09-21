import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ApiError } from '../src/lib/http';

const mocks = vi.hoisted(() => {
  const tx = {
    usuario: { findUnique: vi.fn(), delete: vi.fn() },
    cobrador: { findUnique: vi.fn(), delete: vi.fn() },
    pagoReportado: { count: vi.fn() },
    gasto: { count: vi.fn() },
    conciliacion: { count: vi.fn() },
    loteImportacion: { count: vi.fn() },
    auditoria: { create: vi.fn() },
  };
  const auditar = vi.fn();
  const transaction = vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx));

  return { tx, auditar, transaction };
});

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    usuario: mocks.tx.usuario,
    cobrador: mocks.tx.cobrador,
    pagoReportado: mocks.tx.pagoReportado,
    gasto: mocks.tx.gasto,
    conciliacion: mocks.tx.conciliacion,
    loteImportacion: mocks.tx.loteImportacion,
    auditoria: mocks.tx.auditoria,
  },
}));

vi.mock('../src/lib/audit', () => ({
  auditar: mocks.auditar,
  snapshot: (value: unknown) => value,
}));

import * as cobradoresService from '../src/modules/cobradores/cobradores.service';
import * as usuariosService from '../src/modules/usuarios/usuarios.service';

const actor = { usuarioId: 99, ip: '127.0.0.1' };

const cobradorRow = { id: 1, codigo: 'COB-001', nombre: 'Carlos', usuarioId: null, activo: true };

function usuarioRow(cobrador: { id: number } | null) {
  return { id: 5, passwordHash: 'hash', cobrador };
}

function sinBloqueos() {
  mocks.tx.gasto.count.mockResolvedValue(0);
  mocks.tx.conciliacion.count.mockResolvedValue(0);
  mocks.tx.loteImportacion.count.mockResolvedValue(0);
  mocks.tx.pagoReportado.count.mockResolvedValue(0);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (cb: (client: typeof mocks.tx) => unknown) =>
    cb(mocks.tx),
  );
  sinBloqueos();
});

describe('cobradoresService.removeDefinitivo', () => {
  it('rechaza con 409 y no borra cuando el cobrador tiene pagos reportados', async () => {
    mocks.tx.cobrador.findUnique.mockResolvedValue(cobradorRow);
    mocks.tx.pagoReportado.count.mockResolvedValue(2);

    const error = await cobradoresService.removeDefinitivo(1, actor).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toContain('2 pago(s) reportado(s)');
    expect(mocks.tx.cobrador.delete).not.toHaveBeenCalled();
    expect(mocks.auditar).not.toHaveBeenCalled();
  });

  it('borra el cobrador y audita dentro de la misma transaccion cuando no tiene pagos', async () => {
    mocks.tx.cobrador.findUnique.mockResolvedValue(cobradorRow);
    mocks.tx.pagoReportado.count.mockResolvedValue(0);

    await cobradoresService.removeDefinitivo(1, actor);

    expect(mocks.tx.cobrador.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mocks.auditar).toHaveBeenCalledTimes(1);
    expect(mocks.auditar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: actor.usuarioId,
        entidad: 'cobradores',
        entidadId: 1,
        accion: 'borrar_definitivo',
      }),
      mocks.tx,
    );
  });

  it('convierte un error de clave foranea (P2003) en un 409 limpio', async () => {
    mocks.tx.cobrador.findUnique.mockResolvedValue(cobradorRow);
    mocks.tx.pagoReportado.count.mockResolvedValue(0);
    mocks.tx.cobrador.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '5.22.0',
      }),
    );

    const error = await cobradoresService.removeDefinitivo(1, actor).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect(mocks.auditar).not.toHaveBeenCalled();
  });
});

describe('usuariosService.removeDefinitivo', () => {
  it('rechaza con 400 el auto-borrado sin consultar la base', async () => {
    const error = await usuariosService
      .removeDefinitivo(7, { usuarioId: 7, ip: '127.0.0.1' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect(mocks.tx.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con 409 por gastos registrados', async () => {
    mocks.tx.usuario.findUnique.mockResolvedValue(usuarioRow(null));
    mocks.tx.gasto.count.mockResolvedValue(3);

    const error = await usuariosService.removeDefinitivo(5, actor).catch((e) => e);

    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toContain('3 gasto(s)');
    expect(mocks.tx.usuario.delete).not.toHaveBeenCalled();
  });

  it('rechaza con 409 por conciliaciones', async () => {
    mocks.tx.usuario.findUnique.mockResolvedValue(usuarioRow(null));
    mocks.tx.conciliacion.count.mockResolvedValue(2);

    const error = await usuariosService.removeDefinitivo(5, actor).catch((e) => e);

    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toContain('2 conciliacion(es)');
  });

  it('rechaza con 409 por lotes de importacion', async () => {
    mocks.tx.usuario.findUnique.mockResolvedValue(usuarioRow(null));
    mocks.tx.loteImportacion.count.mockResolvedValue(1);

    const error = await usuariosService.removeDefinitivo(5, actor).catch((e) => e);

    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toContain('1 lote(s) de importacion');
  });

  it('rechaza con 409 por pagos validados (atribucion financiera)', async () => {
    mocks.tx.usuario.findUnique.mockResolvedValue(usuarioRow(null));
    mocks.tx.pagoReportado.count.mockResolvedValue(1);

    const error = await usuariosService.removeDefinitivo(5, actor).catch((e) => e);

    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toContain('1 pago(s) validado(s)');
  });

  it('rechaza con 409 por pagos del cobrador vinculado', async () => {
    mocks.tx.usuario.findUnique.mockResolvedValue(usuarioRow({ id: 42 }));
    mocks.tx.pagoReportado.count.mockImplementation(async (args: { where: { cobradorId?: number } }) =>
      args.where.cobradorId ? 4 : 0,
    );

    const error = await usuariosService.removeDefinitivo(5, actor).catch((e) => e);

    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toContain('4 pago(s) del cobrador vinculado');
    expect(mocks.tx.cobrador.delete).not.toHaveBeenCalled();
  });

  it('elimina un usuario que solo tiene historial de auditoria (el log sobrevive con actor nulo)', async () => {
    mocks.tx.usuario.findUnique.mockResolvedValue(usuarioRow(null));

    await usuariosService.removeDefinitivo(5, actor);

    expect(mocks.tx.usuario.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(mocks.auditar).toHaveBeenCalledTimes(1);
  });

  it('borra primero el cobrador vinculado y luego el usuario, auditando con la transaccion', async () => {
    mocks.tx.usuario.findUnique.mockResolvedValue(usuarioRow({ id: 42 }));

    await usuariosService.removeDefinitivo(5, actor);

    expect(mocks.tx.cobrador.delete).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(mocks.tx.usuario.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(mocks.tx.cobrador.delete.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.usuario.delete.mock.invocationCallOrder[0],
    );
    expect(mocks.auditar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: actor.usuarioId,
        entidad: 'usuarios',
        entidadId: 5,
        accion: 'borrar_definitivo',
      }),
      mocks.tx,
    );
  });

  it('borra solo el usuario cuando no tiene cobrador vinculado', async () => {
    mocks.tx.usuario.findUnique.mockResolvedValue(usuarioRow(null));

    await usuariosService.removeDefinitivo(5, actor);

    expect(mocks.tx.cobrador.delete).not.toHaveBeenCalled();
    expect(mocks.tx.usuario.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(mocks.auditar).toHaveBeenCalledTimes(1);
  });
});
