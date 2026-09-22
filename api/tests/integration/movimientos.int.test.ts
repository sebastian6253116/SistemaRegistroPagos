/**
 * HTTP integration tests for the hard delete of bank movements.
 *
 * HOW TO RUN
 * ----------
 * These tests need a real (disposable) test database and are NOT part of
 * `npm test`. From the `api/` directory:
 *
 *   1) npm run test:integration:prepare   # create <db>_test, migrate, seed
 *   2) npm run test:integration           # run against <db>_test
 *
 * SAFETY: the bootstrap derives `<dbname>_test` from `api/.env` and refuses to
 * run if the resolved DATABASE_URL does not point at a database whose name ends
 * with "_test". It never touches the development database.
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

let ctx: SeedRefs;

beforeEach(async () => {
  await limpiarDatosOperativos();
  ctx = await seedRefs();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function nuevoMovimiento(referencia = refUnica()) {
  return crearMovimiento({
    cuentaRecaudadoraId: ctx.cuentaRecaudadoraId,
    referencia,
    montoBs: '100.00',
  });
}

describe('DELETE /api/movimientos/:id', () => {
  it('elimina un movimiento no conciliado y deja la traza de auditoria (204)', async () => {
    const token = await tokenPara('admin');
    const mov = await nuevoMovimiento();

    const res = await request(app).delete(`/api/movimientos/${mov.id}`).set(bearer(token));

    expect(res.status).toBe(204);
    expect(await prisma.movimientoBanco.findUnique({ where: { id: mov.id } })).toBeNull();

    const audit = await prisma.auditoria.findFirst({
      where: { entidad: 'movimientos_banco', entidadId: mov.id, accion: 'borrar' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.usuarioId).toBe(ctx.adminId);
  });

  it('rechaza con 409 un movimiento conciliado y no lo borra', async () => {
    const token = await tokenPara('admin');
    const { movimiento } = await crearPagoValidado({
      cobradorId: ctx.cobrador1Id,
      cuentaRecaudadoraId: ctx.cuentaRecaudadoraId,
      bancoOrigenId: ctx.bancoOrigenId,
      tipoPagoId: ctx.tipoPagoId,
      referencia: refUnica(),
      montoBs: '100.00',
      usuarioId: ctx.adminId,
    });

    const res = await request(app)
      .delete(`/api/movimientos/${movimiento.id}`)
      .set(bearer(token));

    expect(res.status).toBe(409);
    expect(await prisma.movimientoBanco.findUnique({ where: { id: movimiento.id } })).not.toBeNull();
  });

  it('rechaza con 409 cuando hay un pago vinculado aunque el estado sea no_conciliado', async () => {
    const token = await tokenPara('admin');
    const mov = await nuevoMovimiento();
    await crearPago({
      cobradorId: ctx.cobrador1Id,
      cuentaRecaudadoraId: ctx.cuentaRecaudadoraId,
      bancoOrigenId: ctx.bancoOrigenId,
      tipoPagoId: ctx.tipoPagoId,
      referencia: refUnica(),
      montoBs: '100.00',
      movimientoBancoId: mov.id,
    });

    const res = await request(app).delete(`/api/movimientos/${mov.id}`).set(bearer(token));

    expect(res.status).toBe(409);
    expect(await prisma.movimientoBanco.findUnique({ where: { id: mov.id } })).not.toBeNull();
  });

  it('rechaza con 403 al Administrativo (no tiene movimientos.eliminar)', async () => {
    const token = await tokenPara('administrativo');
    const mov = await nuevoMovimiento();

    const res = await request(app).delete(`/api/movimientos/${mov.id}`).set(bearer(token));

    expect(res.status).toBe(403);
    expect(await prisma.movimientoBanco.findUnique({ where: { id: mov.id } })).not.toBeNull();
  });

  it('devuelve 404 cuando el movimiento no existe', async () => {
    const token = await tokenPara('admin');

    const res = await request(app).delete('/api/movimientos/999999').set(bearer(token));

    expect(res.status).toBe(404);
  });
});
