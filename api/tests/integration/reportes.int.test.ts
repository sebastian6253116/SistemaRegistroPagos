/**
 * HTTP integration coverage for the `cobros` classification filter
 * (`clasificacionAntiguedad`), which REPLACED the removed numeric age filter.
 *
 * HOW TO RUN
 * ----------
 * Needs the disposable test database (see the header of `pagos.int.test.ts`):
 *
 *   1) npm run test:integration:prepare
 *   2) npm run test:integration
 *
 * WHAT THIS PROVES
 * ----------------
 * The filter is a correlated `EXISTS` over the LINKED bank movement:
 * - `del-dia` keeps gap `<= 0` (same day OR negative gap);
 * - `viejo` keeps gap `>=` the `parametros` threshold
 *   (`cobro.umbral_antiguedad_dias`, read at query time);
 * - a payment with NO linked movement is EXCLUDED while the filter is active.
 *
 * The threshold is READ from the live config, never assumed, so the suite stays
 * correct whether the seeded value (30) or another is configured. `del-dia`
 * never depends on the threshold (it is anchored at 0).
 *
 * WHAT THIS DOES NOT COVER
 * ------------------------
 * - The `COALESCE(..., 1)` fallback for a missing `parametros` row: mutating
 *   that shared parameter would corrupt the suite's configuration cache.
 * - The export PDF/Excel subtitle text (asserted indirectly by the controller).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  app,
  bearer,
  crearMovimiento,
  crearPago,
  limpiarDatosOperativos,
  prisma,
  refUnica,
  seedRefs,
  tokenPara,
  type SeedRefs,
} from './helpers';
import { getConfigValues } from '../../src/lib/config-values';

let ctx: SeedRefs;

beforeEach(async () => {
  await limpiarDatosOperativos();
  ctx = await seedRefs();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Fixed reference day at UTC midnight so no assertion depends on "today".
const DIA = new Date('2026-03-10T00:00:00.000Z');

/**
 * Seeds a VALIDATED payment whose linked movement is `hueco` days EARLIER than
 * the reported date (negative => the movement came later), i.e. exactly the
 * signed gap `DATEDIFF(fecha_pago, fecha_ejecucion)` the filter sees. With
 * `conMovimiento: false` the payment is left without a linked movement.
 */
async function crearConHueco(hueco: number, conMovimiento = true) {
  const referencia = refUnica();
  let movimientoBancoId: number | null = null;
  if (conMovimiento) {
    const movimiento = await crearMovimiento({
      cuentaRecaudadoraId: ctx.cuentaRecaudadoraId,
      referencia,
      montoBs: '100.00',
      fecha: new Date(DIA.getTime() - hueco * 86_400_000),
    });
    movimientoBancoId = movimiento.id;
  }

  return crearPago({
    cobradorId: ctx.cobrador1Id,
    cuentaRecaudadoraId: ctx.cuentaRecaudadoraId,
    bancoOrigenId: ctx.bancoOrigenId,
    tipoPagoId: ctx.tipoPagoId,
    referencia,
    montoBs: '100.00',
    fecha: DIA,
    estado: 'validado',
    movimientoBancoId,
  });
}

async function cobrosReport(
  token: string,
  clasificacion?: 'del-dia' | 'viejo',
): Promise<{ id: number; antiguedadDias: number | null }[]> {
  const req = request(app).get('/api/reportes/cobros').set(bearer(token));
  if (clasificacion) req.query({ clasificacionAntiguedad: clasificacion });
  const res = await req;
  expect(res.status).toBe(200);
  return res.body.data as { id: number; antiguedadDias: number | null }[];
}

describe('GET /api/reportes/cobros - clasificacionAntiguedad', () => {
  it('del-dia keeps same-day and negative gaps, excluding old and unlinked payments', async () => {
    const token = await tokenPara('admin');
    const { umbralAntiguedadDias: umbral } = await getConfigValues();

    const mismoDia = await crearConHueco(0);
    const negativo = await crearConHueco(-2);
    const enUmbral = await crearConHueco(umbral);
    const sobreUmbral = await crearConHueco(umbral + 2);
    const sinMovimiento = await crearConHueco(0, false);

    const data = await cobrosReport(token, 'del-dia');
    const ids = data.map((r) => r.id);

    expect(ids).toContain(mismoDia.id);
    expect(ids).toContain(negativo.id);
    expect(ids).not.toContain(enUmbral.id);
    expect(ids).not.toContain(sobreUmbral.id);
    expect(ids).not.toContain(sinMovimiento.id);

    // The emitted age agrees with the bucket (0 and the signed negative).
    expect(data.find((r) => r.id === mismoDia.id)?.antiguedadDias).toBe(0);
    expect(data.find((r) => r.id === negativo.id)?.antiguedadDias).toBe(-2);
  });

  it('viejo keeps gaps at or over the threshold, excluding same-day, negative and unlinked payments', async () => {
    const token = await tokenPara('admin');
    const { umbralAntiguedadDias: umbral } = await getConfigValues();

    const mismoDia = await crearConHueco(0);
    const negativo = await crearConHueco(-2);
    const enUmbral = await crearConHueco(umbral);
    const sobreUmbral = await crearConHueco(umbral + 2);
    const sinMovimiento = await crearConHueco(0, false);

    const data = await cobrosReport(token, 'viejo');
    const ids = data.map((r) => r.id);

    expect(ids).toContain(enUmbral.id);
    expect(ids).toContain(sobreUmbral.id);
    expect(ids).not.toContain(mismoDia.id);
    expect(ids).not.toContain(negativo.id);
    expect(ids).not.toContain(sinMovimiento.id);

    expect(data.find((r) => r.id === enUmbral.id)?.antiguedadDias).toBe(umbral);
    expect(data.find((r) => r.id === sobreUmbral.id)?.antiguedadDias).toBe(umbral + 2);
  });

  it('without the filter returns every payment, including unlinked ones', async () => {
    const token = await tokenPara('admin');
    const { umbralAntiguedadDias: umbral } = await getConfigValues();

    const mismoDia = await crearConHueco(0);
    const negativo = await crearConHueco(-2);
    const enUmbral = await crearConHueco(umbral);
    const sinMovimiento = await crearConHueco(0, false);

    const ids = (await cobrosReport(token)).map((r) => r.id);

    expect(ids).toEqual(
      expect.arrayContaining([mismoDia.id, negativo.id, enUmbral.id, sinMovimiento.id]),
    );
  });
});
