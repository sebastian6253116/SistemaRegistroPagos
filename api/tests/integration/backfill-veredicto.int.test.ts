/**
 * Integration coverage for the CR-005 historical backfill migration
 * (`prisma/migrations/20260922000000_backfill_veredicto_movimiento`).
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
 * The backfill is a single idempotent `UPDATE ... JOIN` whose rule is
 * `DATEDIFF(fecha_pago, fecha_ejecucion) >= umbral ? 'viejo' : 'nuevo'`, writing
 * `fuente_derivacion = 'movimiento'` and a mismatch flag on
 * `revisar_clasificacion`. These tests read the REAL `migration.sql` and execute
 * it verbatim against seeded validated payments with known gaps, then assert the
 * persisted verdict directly. That exercises the exact SQL that will run in
 * production instead of a re-implementation of it.
 *
 * WHAT THIS DOES NOT COVER
 * ------------------------
 * - Prisma's "apply each migration only once" bookkeeping: the statement is
 *   invoked directly (the idempotency guard itself IS asserted).
 * - The production threshold (`1`): the suite runs with the seeded test value.
 * - The `COALESCE(..., 1)` fallback for a missing `parametros` row: mutating that
 *   shared parameter would corrupt the suite's configuration cache.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearMovimiento, crearPago, limpiarDatosOperativos, prisma, refUnica, seedRefs, type SeedRefs } from './helpers';
import { API_ROOT } from './test-database';
import { getConfigValues } from '../../src/lib/config-values';

const MIGRATION_SQL = fs.readFileSync(
  path.join(
    API_ROOT,
    'prisma',
    'migrations',
    '20260922000000_backfill_veredicto_movimiento',
    'migration.sql',
  ),
  'utf8',
);

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

interface CrearConHuecoOpts {
  estado?: 'validado' | 'pendiente' | 'rechazado' | 'duplicado';
  tipoCobro?: 'nuevo' | 'viejo';
  conMovimiento?: boolean;
}

/**
 * Seeds a payment whose linked movement is `hueco` days EARLIER than the
 * reported date (negative => the movement came later). This is exactly the gap
 * `DATEDIFF(fecha_pago, fecha_ejecucion)` will see.
 */
async function crearConHueco(hueco: number, opts: CrearConHuecoOpts = {}) {
  const referencia = refUnica();
  const fechaEjecucion = new Date(DIA.getTime() - hueco * 86_400_000);

  let movimientoBancoId: number | null = null;
  if (opts.conMovimiento !== false) {
    const movimiento = await crearMovimiento({
      cuentaRecaudadoraId: ctx.cuentaRecaudadoraId,
      referencia,
      montoBs: '100.00',
      fecha: fechaEjecucion,
    });
    movimientoBancoId = movimiento.id;
  }

  const pago = await crearPago({
    cobradorId: ctx.cobrador1Id,
    cuentaRecaudadoraId: ctx.cuentaRecaudadoraId,
    bancoOrigenId: ctx.bancoOrigenId,
    tipoPagoId: ctx.tipoPagoId,
    referencia,
    montoBs: '100.00',
    fecha: DIA,
    estado: opts.estado ?? 'validado',
    movimientoBancoId,
  });

  if (opts.tipoCobro === 'viejo') {
    await prisma.pagoReportado.update({ where: { id: pago.id }, data: { tipoCobro: 'viejo' } });
  }

  return pago;
}

describe('backfill 20260922000000_backfill_veredicto_movimiento (CR-005)', () => {
  it('classifies validated payments by the real threshold and marks the source', async () => {
    const { umbralAntiguedadDias: umbral } = await getConfigValues(true);

    const enElUmbral = await crearConHueco(umbral);
    const bajoElUmbral = await crearConHueco(umbral - 1);
    const mismoDia = await crearConHueco(0);
    const negativo = await crearConHueco(-3);
    // Already carrying a non-movement verdict: the guard's `<> 'movimiento'`
    // branch must re-classify it, not skip it.
    const preMarcado = await crearConHueco(umbral);
    await prisma.pagoReportado.update({
      where: { id: preMarcado.id },
      data: { fuenteDerivacion: 'reporte', tipoCobroDerivado: 'nuevo' },
    });

    const affected = await prisma.$executeRawUnsafe(MIGRATION_SQL);
    expect(affected).toBe(5);

    const ids = [enElUmbral.id, bajoElUmbral.id, mismoDia.id, negativo.id, preMarcado.id];
    const filas = await prisma.pagoReportado.findMany({ where: { id: { in: ids } } });
    const porId = new Map(filas.map((f) => [f.id, f]));

    const esperado = new Map<number, 'viejo' | 'nuevo'>([
      [enElUmbral.id, 'viejo'],
      [bajoElUmbral.id, 'nuevo'],
      [mismoDia.id, 'nuevo'],
      [negativo.id, 'nuevo'],
      [preMarcado.id, 'viejo'],
    ]);

    for (const [id, veredicto] of esperado) {
      const fila = porId.get(id);
      expect(fila).toBeDefined();
      expect(fila!.estado).toBe('validado');
      expect(fila!.fuenteDerivacion).toBe('movimiento');
      expect(fila!.tipoCobroDerivado).toBe(veredicto);
      expect(fila!.revisarClasificacion).toBe(veredicto !== fila!.tipoCobro);
    }
  });

  it('flags a mismatch without overwriting the collector mark', async () => {
    const { umbralAntiguedadDias: umbral } = await getConfigValues(true);

    const marcadoNuevo = await crearConHueco(umbral + 1); // derived viejo, marked nuevo
    const marcadoViejo = await crearConHueco(0, { tipoCobro: 'viejo' }); // derived nuevo, marked viejo

    const affected = await prisma.$executeRawUnsafe(MIGRATION_SQL);
    expect(affected).toBe(2);

    const a = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: marcadoNuevo.id } });
    expect(a.tipoCobro).toBe('nuevo');
    expect(a.tipoCobroDerivado).toBe('viejo');
    expect(a.revisarClasificacion).toBe(true);

    const b = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: marcadoViejo.id } });
    expect(b.tipoCobro).toBe('viejo');
    expect(b.tipoCobroDerivado).toBe('nuevo');
    expect(b.revisarClasificacion).toBe(true);
  });

  it('leaves non-validated and unlinked payments untouched', async () => {
    const { umbralAntiguedadDias: umbral } = await getConfigValues(true);

    const pendiente = await crearConHueco(umbral + 5, { estado: 'pendiente' });
    const rechazado = await crearConHueco(umbral + 5, { estado: 'rechazado' });
    const sinMovimiento = await crearConHueco(umbral + 5, { conMovimiento: false });

    const affected = await prisma.$executeRawUnsafe(MIGRATION_SQL);
    expect(affected).toBe(0);

    for (const id of [pendiente.id, rechazado.id, sinMovimiento.id]) {
      const fila = await prisma.pagoReportado.findUniqueOrThrow({ where: { id } });
      expect(fila.tipoCobroDerivado).toBeNull();
      expect(fila.fuenteDerivacion).toBeNull();
      expect(fila.revisarClasificacion).toBe(false);
    }
  });

  it('is idempotent: a second run affects 0 rows and does not rewrite the verdict', async () => {
    const { umbralAntiguedadDias: umbral } = await getConfigValues(true);
    const objetivo = await crearConHueco(umbral);

    const primero = await prisma.$executeRawUnsafe(MIGRATION_SQL);
    expect(primero).toBe(1);
    const despuesPrimero = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(despuesPrimero.tipoCobroDerivado).toBe('viejo');
    expect(despuesPrimero.fuenteDerivacion).toBe('movimiento');

    const segundo = await prisma.$executeRawUnsafe(MIGRATION_SQL);
    expect(segundo).toBe(0);

    const despuesSegundo = await prisma.pagoReportado.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(despuesSegundo.tipoCobroDerivado).toBe('viejo');
    expect(despuesSegundo.fuenteDerivacion).toBe('movimiento');
    expect(despuesSegundo.updatedAt.getTime()).toBe(despuesPrimero.updatedAt.getTime());
  });
});
