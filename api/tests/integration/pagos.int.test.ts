/**
 * HTTP integration tests for validated-payment editing and automatic validation.
 *
 * HOW TO RUN
 * ----------
 * These tests need a real (disposable) test database and are NOT part of
 * `npm test`. Run them in two steps, from the `api/` directory:
 *
 *   1) npm run test:integration:prepare   # create <db>_test, migrate, seed
 *   2) npm run test:integration           # run this file against <db>_test
 *
 * SAFETY: the bootstrap derives `<dbname>_test` from `api/.env` and refuses to
 * run if the resolved DATABASE_URL does not point at a database whose name
 * ends with "_test". It never touches the development database. To prove the
 * guard, run:
 *
 *   $env:DATABASE_URL="mysql://<user>:<pass>@<host>:<port>/gestion_cobros"
 *   npm run test:integration:prepare
 *
 * and it will exit 1 with a loud [SAFETY GUARD] error.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  app,
  bearer,
  crearMovimiento,
  crearPago,
  crearPagoValidado,
  limpiarDatosOperativos,
  prisma,
  refUnica,
  seedRefs,
  tokenPara,
  type SeedRefs,
} from './helpers';
import { pagoCasReconciliacionWhere } from '../../src/modules/pagos/optimistic-lock';

let ctx: SeedRefs;

beforeEach(async () => {
  await limpiarDatosOperativos();
  ctx = await seedRefs();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function basePago(overrides: Partial<Parameters<typeof crearPago>[0]> = {}) {
  return {
    cobradorId: ctx.cobrador1Id,
    cuentaRecaudadoraId: ctx.cuentaRecaudadoraId,
    bancoOrigenId: ctx.bancoOrigenId,
    tipoPagoId: ctx.tipoPagoId,
    referencia: refUnica(),
    montoBs: '100.00',
    montoUsd: '1.00',
    ...overrides,
  };
}

describe('PUT /api/pagos/:id - editing a validated payment', () => {
  it('changes only a harmless field (cliente): 200, estado stays validado, diferenciaBs unchanged', async () => {
    const token = await tokenPara('admin');
    const { pago, conciliacion } = await crearPagoValidado({
      ...basePago(),
      usuarioId: ctx.adminId,
    });

    const res = await request(app)
      .put(`/api/pagos/${pago.id}`)
      .set(bearer(token))
      .send({ cliente: 'Cliente Editado' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('validado');
    expect(res.body.cliente).toBe('Cliente Editado');

    const concDb = await prisma.conciliacion.findUniqueOrThrow({
      where: { pagoReportadoId: pago.id },
    });
    expect(concDb.diferenciaBs.toString()).toBe(conciliacion.diferenciaBs.toString());
  });

  it('rejects an amount far outside tolerance with 409 and changes NOTHING', async () => {
    const token = await tokenPara('admin');
    const { pago, movimiento, conciliacion } = await crearPagoValidado({
      ...basePago(),
      usuarioId: ctx.adminId,
    });

    const pagoAntes = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: pago.id } });
    const movAntes = await prisma.movimientoBanco.findUniqueOrThrow({ where: { id: movimiento.id } });
    const concAntes = await prisma.conciliacion.findUniqueOrThrow({ where: { id: conciliacion.id } });

    const res = await request(app)
      .put(`/api/pagos/${pago.id}`)
      .set(bearer(token))
      .send({ montoBs: 200 });

    expect(res.status).toBe(409);

    const pagoDespues = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: pago.id } });
    const movDespues = await prisma.movimientoBanco.findUniqueOrThrow({ where: { id: movimiento.id } });
    const concDespues = await prisma.conciliacion.findUniqueOrThrow({ where: { id: conciliacion.id } });

    expect(pagoDespues.montoBs.toString()).toBe(pagoAntes.montoBs.toString());
    expect(pagoDespues.estado).toBe('validado');
    expect(pagoDespues.updatedAt.getTime()).toBe(pagoAntes.updatedAt.getTime());
    expect(movDespues.montoBs.toString()).toBe(movAntes.montoBs.toString());
    expect(movDespues.estadoConciliacion).toBe(movAntes.estadoConciliacion);
    expect(concDespues.diferenciaBs.toString()).toBe(concAntes.diferenciaBs.toString());
  });

  it('accepts an amount within tolerance and recalculates diferenciaBs', async () => {
    const token = await tokenPara('admin');
    const { pago } = await crearPagoValidado({
      ...basePago(),
      montoBs: '100.00',
      usuarioId: ctx.adminId,
    });

    const res = await request(app)
      .put(`/api/pagos/${pago.id}`)
      .set(bearer(token))
      .send({ montoBs: 100.01 });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('validado');

    const pagoDb = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: pago.id } });
    expect(pagoDb.montoBs.toString()).toBe('100.01');

    const concDb = await prisma.conciliacion.findUniqueOrThrow({
      where: { pagoReportadoId: pago.id },
    });
    expect(concDb.diferenciaBs.toString()).toBe('0.01');
  });

  it('forbids editing a validated payment without pagos.editar (403)', async () => {
    const token = await tokenPara('cobrador1');
    const { pago } = await crearPagoValidado({
      ...basePago({ cobradorId: ctx.cobrador1Id }),
      usuarioId: ctx.adminId,
    });

    const res = await request(app)
      .put(`/api/pagos/${pago.id}`)
      .set(bearer(token))
      .send({ cliente: 'No deberia cambiar' });

    expect(res.status).toBe(403);

    const pagoDb = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: pago.id } });
    expect(pagoDb.cliente).not.toBe('No deberia cambiar');
  });
});

describe('PUT /api/pagos/:id - non-editable states', () => {
  it('rejects editing a rechazado payment with 409', async () => {
    const token = await tokenPara('admin');
    const pago = await crearPago(basePago({ estado: 'rechazado', motivoRechazo: 'motivo previo' }));

    const res = await request(app)
      .put(`/api/pagos/${pago.id}`)
      .set(bearer(token))
      .send({ cliente: 'X' });

    expect(res.status).toBe(409);

    const pagoDb = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: pago.id } });
    expect(pagoDb.estado).toBe('rechazado');
    expect(pagoDb.cliente).toBe(pago.cliente);
    expect(pagoDb.updatedAt.getTime()).toBe(pago.updatedAt.getTime());
  });

  it('rejects editing a duplicado payment with 409', async () => {
    const token = await tokenPara('admin');
    const pago = await crearPago(basePago({ estado: 'duplicado' }));

    const res = await request(app)
      .put(`/api/pagos/${pago.id}`)
      .set(bearer(token))
      .send({ cliente: 'X' });

    expect(res.status).toBe(409);

    const pagoDb = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: pago.id } });
    expect(pagoDb.estado).toBe('duplicado');
    expect(pagoDb.cliente).toBe(pago.cliente);
    expect(pagoDb.updatedAt.getTime()).toBe(pago.updatedAt.getTime());
  });
});

describe('POST /api/pagos/:id/validar - automatic path', () => {
  it('blocks the automatic path when the payment is a duplicate of an already-reconciled movement (409)', async () => {
    const token = await tokenPara('admin');
    const referencia = refUnica();

    // Already reconciled pair: movement + validated payment + conciliacion.
    await crearPagoValidado({
      ...basePago({ referencia, montoBs: '100.00' }),
      usuarioId: ctx.adminId,
    });

    // A pending payment with the SAME reference + amount => duplicate signal.
    const duplicado = await crearPago(
      basePago({ referencia, montoBs: '100.00', estado: 'pendiente' }),
    );

    const res = await request(app)
      .post(`/api/pagos/${duplicado.id}/validar`)
      .set(bearer(token))
      .send({});

    expect(res.status).toBe(409);

    const pagoDb = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: duplicado.id } });
    expect(pagoDb.estado).toBe('pendiente');
  });

  it('still auto-validates a clean pending payment with a free matching movement (200)', async () => {
    const token = await tokenPara('admin');
    const referencia = refUnica();
    const movimiento = await crearMovimiento({
      cuentaRecaudadoraId: ctx.cuentaRecaudadoraId,
      referencia,
      montoBs: '100.00',
      estado: 'no_conciliado',
    });
    const pago = await crearPago(
      basePago({ referencia, montoBs: '100.00', estado: 'pendiente' }),
    );

    const res = await request(app)
      .post(`/api/pagos/${pago.id}/validar`)
      .set(bearer(token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('validado');

    const pagoDb = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: pago.id } });
    expect(pagoDb.movimientoBancoId).toBe(movimiento.id);

    const movDb = await prisma.movimientoBanco.findUniqueOrThrow({ where: { id: movimiento.id } });
    expect(movDb.estadoConciliacion).toBe('conciliado');

    const concDb = await prisma.conciliacion.findUniqueOrThrow({
      where: { pagoReportadoId: pago.id },
    });
    expect(concDb.movimientoBancoId).toBe(movimiento.id);
    expect(concDb.tipo).toBe('automatica');
  });
});

describe('CAS guard used by validarPago', () => {
  it('affects 0 rows when the payment changed after the snapshot was read', async () => {
    const pago = await crearPago(basePago({ estado: 'pendiente' }));
    const snapshot = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: pago.id } });
    // Concurrent change to a reconciliation-relevant field: snapshot goes stale.
    await prisma.pagoReportado.update({ where: { id: pago.id }, data: { montoBs: '999.00' } });

    const { count } = await prisma.pagoReportado.updateMany({
      where: pagoCasReconciliacionWhere(snapshot),
      data: { estado: 'validado' },
    });
    expect(count).toBe(0);
  });
});

describe('PUT /api/pagos/:id - input validation', () => {
  it('returns 400 (not 500) for montoBs = 0 on a pending payment', async () => {
    const token = await tokenPara('admin');
    const pago = await crearPago(basePago({ estado: 'pendiente' }));

    const res = await request(app)
      .put(`/api/pagos/${pago.id}`)
      .set(bearer(token))
      .send({ montoBs: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});
