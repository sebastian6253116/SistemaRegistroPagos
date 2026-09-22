import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Dashboard aggregates (spec section 6.2).
 *
 * DATE HANDLING: `fecha_pago` is a business CALENDAR DATE (MySQL DATE column),
 * not an instant. It is therefore compared and grouped as a plain date and is
 * NEVER shifted by a timezone offset. The only place the business timezone
 * (America/Caracas) matters is deciding which calendar day "today" is.
 *
 * All aggregates are computed in the database; Node only shapes the response.
 */
const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC-4, no DST

/** Business "today" (America/Caracas) as a YYYY-MM-DD string. */
function hoyCaracas(): string {
  return new Date(Date.now() - CARACAS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Adds days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function money(value: unknown): string {
  return new Prisma.Decimal(value == null ? '0' : String(value)).toFixed(2);
}

function numero(value: unknown): number {
  return value == null ? 0 : Number(value);
}

function tasa(value: unknown): number | null {
  return value == null ? null : Number(new Prisma.Decimal(String(value)).toFixed(6));
}

function variacionPct(actual: number, base: number): number | null {
  if (!base) return null;
  return Number((((actual - base) / base) * 100).toFixed(2));
}

interface AgregadoRow {
  totalUsd: Prisma.Decimal | null;
  totalBs: Prisma.Decimal | null;
  cantidad: bigint;
  tasaPromedio: Prisma.Decimal | null;
}

/** Aggregates validated payments for the half-open date range [desde, hasta). */
async function agregadoValidado(desde: string, hasta: string): Promise<AgregadoRow> {
  const rows = await prisma.$queryRaw<AgregadoRow[]>(Prisma.sql`
    SELECT COALESCE(SUM(monto_usd), 0) AS totalUsd,
           COALESCE(SUM(monto_bs), 0) AS totalBs,
           COUNT(*) AS cantidad,
           SUM(monto_usd * tasa) / NULLIF(SUM(monto_usd), 0) AS tasaPromedio
    FROM pagos_reportados
    WHERE estado = 'validado' AND fecha_pago >= ${desde} AND fecha_pago < ${hasta}
  `);
  return rows[0] ?? { totalUsd: null, totalBs: null, cantidad: BigInt(0), tasaPromedio: null };
}

interface PendientesRow {
  cantidad: bigint;
  montoUsd: Prisma.Decimal | null;
  antiguedadMaxHoras: bigint | null;
  antiguedadPromedioHoras: Prisma.Decimal | null;
}

interface RankingRow {
  cobradorId: number;
  nombre: string;
  cantidad: bigint;
  totalUsd: Prisma.Decimal | null;
}

interface SinConciliarRow {
  cantidad: bigint;
  montoBs: Prisma.Decimal | null;
}

export async function resumen(fechaParam?: string) {
  const fecha = fechaParam ?? hoyCaracas();
  const manana = sumarDias(fecha, 1);
  const ayer = sumarDias(fecha, -1);
  const hace7 = sumarDias(fecha, -7);

  const [hoy, previo, ultimos7, pendientesRows, rankingRows, sinConciliarRows] =
    await Promise.all([
      agregadoValidado(fecha, manana),
      agregadoValidado(ayer, fecha),
      agregadoValidado(hace7, fecha),
      prisma.$queryRaw<PendientesRow[]>(Prisma.sql`
        SELECT COUNT(*) AS cantidad,
               COALESCE(SUM(monto_usd), 0) AS montoUsd,
               COALESCE(MAX(TIMESTAMPDIFF(HOUR, created_at, UTC_TIMESTAMP())), 0) AS antiguedadMaxHoras,
               COALESCE(AVG(TIMESTAMPDIFF(HOUR, created_at, UTC_TIMESTAMP())), 0) AS antiguedadPromedioHoras
        FROM pagos_reportados
        WHERE estado = 'pendiente'
      `),
      prisma.$queryRaw<RankingRow[]>(Prisma.sql`
        SELECT c.id AS cobradorId, c.nombre AS nombre, COUNT(*) AS cantidad,
               COALESCE(SUM(p.monto_usd), 0) AS totalUsd
        FROM pagos_reportados p
        INNER JOIN cobradores c ON c.id = p.cobrador_id
        WHERE p.estado = 'validado' AND p.fecha_pago >= ${fecha} AND p.fecha_pago < ${manana}
        GROUP BY c.id, c.nombre
        ORDER BY totalUsd DESC
        LIMIT 10
      `),
      prisma.$queryRaw<SinConciliarRow[]>(Prisma.sql`
        SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto_bs), 0) AS montoBs
        FROM movimientos_banco
        WHERE estado_conciliacion = 'no_conciliado'
      `),
    ]);

  const totalHoyUsd = numero(hoy.totalUsd);
  const totalPrevioUsd = numero(previo.totalUsd);
  const total7Usd = numero(ultimos7.totalUsd);
  const promedio7Usd = total7Usd / 7;

  const pendientes = pendientesRows[0] ?? {
    cantidad: BigInt(0),
    montoUsd: null,
    antiguedadMaxHoras: BigInt(0),
    antiguedadPromedioHoras: null,
  };
  const sinConciliar = sinConciliarRows[0] ?? { cantidad: BigInt(0), montoBs: null };

  return {
    fecha,
    cobrosDelDia: {
      totalUsd: money(hoy.totalUsd),
      totalBs: money(hoy.totalBs),
      cantidad: numero(hoy.cantidad),
      tasaPromedioPonderada: tasa(hoy.tasaPromedio),
    },
    comparativo: {
      vsDiaAnterior: {
        totalUsd: money(previo.totalUsd),
        variacionPct: variacionPct(totalHoyUsd, totalPrevioUsd),
      },
      vsPromedio7Dias: {
        promedioUsd: money(promedio7Usd),
        variacionPct: variacionPct(totalHoyUsd, promedio7Usd),
      },
    },
    pendientes: {
      cantidad: numero(pendientes.cantidad),
      montoUsd: money(pendientes.montoUsd),
      antiguedadMaxHoras: numero(pendientes.antiguedadMaxHoras),
      antiguedadPromedioHoras: numero(pendientes.antiguedadPromedioHoras),
    },
    rankingCobradores: rankingRows.map((r) => ({
      cobradorId: r.cobradorId,
      nombre: r.nombre,
      cantidad: numero(r.cantidad),
      totalUsd: money(r.totalUsd),
    })),
    movimientosSinConciliar: {
      cantidad: numero(sinConciliar.cantidad),
      montoBs: money(sinConciliar.montoBs),
    },
  };
}

interface SerieRow {
  fecha: string;
  totalUsd: Prisma.Decimal | null;
  cantidad: bigint;
}

/** Daily series of validated payments for the last N days (inclusive of today). */
export async function serie(dias: number) {
  const hoy = hoyCaracas();
  const desde = sumarDias(hoy, -(dias - 1));
  const hasta = sumarDias(hoy, 1);

  // `fecha_pago` is already a DATE column: group it directly, no offset shift.
  const rows = await prisma.$queryRaw<SerieRow[]>(Prisma.sql`
    SELECT DATE_FORMAT(fecha_pago, '%Y-%m-%d') AS fecha,
           COALESCE(SUM(monto_usd), 0) AS totalUsd,
           COUNT(*) AS cantidad
    FROM pagos_reportados
    WHERE estado = 'validado' AND fecha_pago >= ${desde} AND fecha_pago < ${hasta}
    GROUP BY DATE_FORMAT(fecha_pago, '%Y-%m-%d')
  `);

  const porFecha = new Map(rows.map((r) => [r.fecha, r]));
  const data: { fecha: string; totalUsd: string; cantidad: number }[] = [];
  for (let i = 0; i < dias; i += 1) {
    const fecha = sumarDias(desde, i);
    const row = porFecha.get(fecha);
    data.push({
      fecha,
      totalUsd: money(row?.totalUsd),
      cantidad: numero(row?.cantidad),
    });
  }
  return { data };
}

interface NuevoViejoRow {
  tipo: string;
  cantidad: bigint;
  totalUsd: Prisma.Decimal | null;
}

/**
 * New-vs-old split read from the PERSISTED movement-derived verdict: counts only
 * validated payments with `fuente_derivacion = 'movimiento'`, grouped by
 * `tipo_cobro_derivado`. A payment with no movement-derived verdict is EXCLUDED
 * (neither nuevo nor viejo), never bucketed by the collector mark.
 */
export async function nuevoViejo(desde?: string, hasta?: string) {
  const hoy = hoyCaracas();
  const desdeFecha = desde ?? sumarDias(hoy, -29);
  const hastaFecha = hasta ?? hoy;
  const hastaExclusivo = sumarDias(hastaFecha, 1);

  const rows = await prisma.$queryRaw<NuevoViejoRow[]>(Prisma.sql`
    SELECT tipo_cobro_derivado AS tipo,
           COUNT(*) AS cantidad,
           COALESCE(SUM(monto_usd), 0) AS totalUsd
    FROM pagos_reportados
    WHERE estado = 'validado' AND fecha_pago >= ${desdeFecha} AND fecha_pago < ${hastaExclusivo}
      AND fuente_derivacion = 'movimiento'
    GROUP BY tipo_cobro_derivado
  `);

  const vacio = { cantidad: 0, totalUsd: '0.00' };
  const out = { nuevo: { ...vacio }, viejo: { ...vacio } };
  for (const r of rows) {
    if (r.tipo === 'nuevo' || r.tipo === 'viejo') {
      out[r.tipo] = { cantidad: numero(r.cantidad), totalUsd: money(r.totalUsd) };
    }
  }
  return { desde: desdeFecha, hasta: hastaFecha, ...out };
}
