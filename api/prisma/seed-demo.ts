/**
 * Demo data seed (optional).
 *
 * Generates ~30 days of realistic activity so the dashboard and the reports show
 * meaningful data right after install: reported payments, reconciliations, bank
 * movements that nobody reported, expenses and daily reference rates.
 *
 * It is safe to run more than once: it skips if demo data is already present.
 *
 * Run with:  npx tsx prisma/seed-demo.ts
 */
import { PrismaClient, Prisma, TipoCobro, EstadoPago, TipoConciliacion } from '@prisma/client';

const prisma = new PrismaClient();

// Deterministic PRNG so the demo dataset is reproducible.
let seed = 20260919;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function rndInt(min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min;
}
function rndDecimal(min: number, max: number, decimals = 2): Prisma.Decimal {
  return new Prisma.Decimal((rnd() * (max - min) + min).toFixed(decimals));
}

const DIAS = 30;

async function main() {
  const yaHay = await prisma.pagoReportado.count();
  if (yaHay >= 20) {
    console.log(`Demo seed omitido: ya existen ${yaHay} pagos reportados.`);
    return;
  }

  console.log('Generando datos de demostracion...');

  const cuenta = await prisma.cuentaRecaudadora.findFirst();
  if (!cuenta) throw new Error('No hay cuenta recaudadora. Ejecute primero: npm run seed');

  const bancos = await prisma.banco.findMany({ take: 8 });
  const cobradores = await prisma.cobrador.findMany({ orderBy: { id: 'asc' } });
  if (cobradores.length === 0) throw new Error('No hay cobradores. Ejecute primero: npm run seed');

  const admin = await prisma.usuario.findFirst({ where: { usuario: 'administrativo' } });
  const validadorId = admin?.id ?? (await prisma.usuario.findFirst())!.id;

  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);

  const clientes = [
    'Panaderia La Espiga', 'Ferreteria El Tornillo', 'Bodega San Jose',
    'Clinica Santa Rosa', 'Distribuidora Caracas', 'Farmacia del Pueblo',
    'Restaurante El Fogón', 'Libreria Nacional', 'Taller Mecanico RX',
    'Supermercado Central',
  ];
  const categorias = ['Transporte', 'Servicios', 'Suministros', 'Nomina', 'Mantenimiento'];
  const autorizantes = ['Gerencia General', 'Direccion Administrativa', 'Presidencia'];

  let refCounter = 70000000;
  let pagosCreados = 0;
  let movimientosCreados = 0;
  let gastosCreados = 0;

  for (let d = 0; d < DIAS; d += 1) {
    const fecha = new Date(hoy);
    fecha.setUTCDate(fecha.getUTCDate() - (DIAS - 1 - d));

    // Daily reference rate with gentle drift around 180 Bs/USD.
    const tasaRef = new Prisma.Decimal((175 + rnd() * 12).toFixed(6));
    await prisma.tasaReferencia.upsert({
      where: { fecha },
      update: { valor: tasaRef, fuente: 'demo' },
      create: { fecha, valor: tasaRef, fuente: 'demo' },
    });

    // Weekend: much less activity.
    const dow = fecha.getUTCDay();
    const cantidadPagos = dow === 0 ? 0 : rndInt(1, 3);
    const esReciente = d >= DIAS - 2; // last two days stay pending

    for (let i = 0; i < cantidadPagos; i += 1) {
      const cobrador = cobradores[rndInt(0, cobradores.length - 1)];
      const bancoOrigen = bancos[rndInt(0, bancos.length - 1)];
      // The collector's implicit rate deviates a bit from the reference.
      const tasa = new Prisma.Decimal((Number(tasaRef) * (0.97 + rnd() * 0.08)).toFixed(6));
      const montoUsd = rndDecimal(15, 220, 2);
      const montoBs = montoUsd.times(tasa).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const referencia = String(++refCounter);

      const tipoCobro = rnd() > 0.35 ? TipoCobro.nuevo : TipoCobro.viejo;
      const tipoCobroDerivado = tipoCobro;

      const estadoPago: EstadoPago = esReciente
        ? EstadoPago.pendiente
        : rnd() > 0.12
          ? EstadoPago.validado
          : rnd() > 0.5
            ? EstadoPago.rechazado
            : EstadoPago.duplicado;

      const pago = await prisma.pagoReportado.create({
        data: {
          cobradorId: cobrador.id,
          fechaPago: fecha,
          referencia,
          bancoOrigenId: bancoOrigen.id,
          cuentaRecaudadoraId: cuenta.id,
          montoBs,
          montoUsd,
          tasa,
          cliente: clientes[rndInt(0, clientes.length - 1)],
          concepto: 'Cobro de servicio',
          tipoCobro,
          tipoCobroDerivado,
          revisarClasificacion: false,
          estado: estadoPago,
          validadoPor: estadoPago === EstadoPago.pendiente ? null : validadorId,
          validadoAt: estadoPago === EstadoPago.pendiente ? null : fecha,
          motivoRechazo: estadoPago === EstadoPago.rechazado ? 'No se encontro el ingreso en el banco' : null,
        },
      });
      pagosCreados++;

      if (estadoPago === EstadoPago.validado) {
        // Create the matching bank movement and reconcile it.
        const movimiento = await prisma.movimientoBanco.create({
          data: {
            cuentaRecaudadoraId: cuenta.id,
            referencia,
            montoBs,
            fechaEjecucion: fecha,
            estadoConciliacion: 'conciliado',
          },
        });
        movimientosCreados++;

        await prisma.conciliacion.create({
          data: {
            pagoReportadoId: pago.id,
            movimientoBancoId: movimiento.id,
            usuarioId: validadorId,
            tipo: rnd() > 0.3 ? TipoConciliacion.automatica : TipoConciliacion.manual,
            diferenciaBs: new Prisma.Decimal(0),
          },
        });
        await prisma.pagoReportado.update({
          where: { id: pago.id },
          data: { movimientoBancoId: movimiento.id },
        });
      }
    }

    // Money that entered the bank and nobody reported (un-reconciled movements).
    if (dow !== 0 && rnd() > 0.6) {
      await prisma.movimientoBanco.create({
        data: {
          cuentaRecaudadoraId: cuenta.id,
          referencia: String(++refCounter),
          montoBs: rndDecimal(500, 5000, 2),
          fechaEjecucion: fecha,
          estadoConciliacion: 'no_conciliado',
        },
      });
      movimientosCreados++;
    }

    // Occasional expense.
    if (dow !== 0 && dow !== 6 && rnd() > 0.55) {
      const tasaGasto = tasaRef;
      const montoUsdGasto = rndDecimal(5, 80, 2);
      const montoBsGasto = montoUsdGasto.times(tasaGasto).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      await prisma.gasto.create({
        data: {
          fecha,
          montoBs: montoBsGasto,
          montoUsd: montoUsdGasto,
          tasa: tasaGasto,
          descripcion: 'Gasto operativo de demostracion',
          categoria: categorias[rndInt(0, categorias.length - 1)],
          autorizadoPor: autorizantes[rndInt(0, autorizantes.length - 1)],
          registradoPor: validadorId,
        },
      });
      gastosCreados++;
    }
  }

  console.log(`  - ${pagosCreados} pagos reportados`);
  console.log(`  - ${movimientosCreados} movimientos bancarios`);
  console.log(`  - ${gastosCreados} gastos`);
  console.log(`  - ${DIAS} tasas de referencia`);
  console.log('Demo seed complete.');
}

main()
  .catch((e) => {
    console.error('Demo seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
