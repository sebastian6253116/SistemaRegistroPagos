import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { paginate, type PaginationParams } from '../../lib/http';
import { desviacionPorcentual, tasaPromedioPonderada } from '../../lib/money';
import { antiguedadEnDias, esPagoViejo } from '../../lib/classification';
import { getConfigValues } from '../../lib/config-values';
import { prisma } from '../../lib/prisma';
import * as gastosService from '../gastos/gastos.service';
import type { EstadoPagoFiltro, TipoReporte } from './reportes.schema';

export interface ReportFilters {
  fechaDesde?: string;
  fechaHasta?: string;
  // Date range for the linked bank movement's `fechaEjecucion`.
  fechaMovimientoDesde?: string;
  fechaMovimientoHasta?: string;
  cobradorId?: number;
  bancoId?: number;
  estado?: EstadoPagoFiltro;
  // Movement-derived vintage bucket, expressed against the LINKED bank
  // movement's `fechaEjecucion`:
  // - `del-dia`: whole-day gap `<= 0` (same day, or movement executed later).
  // - `viejo`: gap `>=` the configured threshold (`cobro.umbral_antiguedad_dias`).
  // A payment with no linked movement is EXCLUDED while the filter is active.
  // Opt-in: only the `cobros` report applies it.
  clasificacionAntiguedad?: 'del-dia' | 'viejo';
}

/** Pagination used by exports: fetch every matching row. */
export const SIN_LIMITE: PaginationParams = { page: 1, pageSize: 100000, skip: 0, take: 100000 };

// ---------------------------------------------------------------------------
// Date & serialization helpers
// ---------------------------------------------------------------------------

function inicioDiaUTC(value?: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function finDiaUTC(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * Threshold for the `viejo` bucket, read from `parametros`
 * (`cobro.umbral_antiguedad_dias`) with a fallback of `1`, EXACTLY like the
 * backfill migration (`20260922000000_backfill_veredicto_movimiento`). Reading
 * it here keeps the FILTER aligned with the PERSISTED verdict instead of
 * duplicating the threshold; the parameter value itself is never written.
 */
const UMBRAL_ANTIGUEDAD_SQL = Prisma.sql`COALESCE(
  (SELECT CAST(valor AS SIGNED) FROM parametros WHERE clave = 'cobro.umbral_antiguedad_dias'),
  1
)`;

/**
 * Correlated EXISTS for the opt-in classification filter. It keeps payments
 * whose SIGNED whole-day gap against the LINKED bank movement falls in the
 * requested bucket:
 * - `del-dia`: `DATEDIFF(p.fecha_pago, mb.fecha_ejecucion) <= 0` (gap 0, plus
 *   NEGATIVE gaps where the movement executed AFTER the reported date — both
 *   are "not old" and share the same non-old rendering as the badge).
 * - `viejo`: `DATEDIFF(p.fecha_pago, mb.fecha_ejecucion) >= umbral`, where
 *   `umbral` is the `parametros` value above.
 *
 * Both sides are DATE columns, so `DATEDIFF` yields whole days and matches
 * `antiguedadEnDias`'s floor semantics. A payment with NO linked movement is
 * EXCLUDED: the correlated row does not exist, so the predicate is false.
 * Shared by the raw-SQL path and by the Prisma path (which resolves the
 * matching ids with it — see `idsClasificacionAntiguedad`).
 */
function condicionClasificacionAntiguedadSql(
  clasificacion: 'del-dia' | 'viejo',
): Prisma.Sql {
  const comparacion =
    clasificacion === 'viejo'
      ? Prisma.sql`DATEDIFF(p.fecha_pago, mb.fecha_ejecucion) >= ${UMBRAL_ANTIGUEDAD_SQL}`
      : Prisma.sql`DATEDIFF(p.fecha_pago, mb.fecha_ejecucion) <= 0`;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM movimientos_banco mb
    WHERE mb.id = p.movimiento_banco_id
      AND ${comparacion}
  )`;
}

function money(value: unknown): string {
  return new Prisma.Decimal(value == null ? '0' : String(value)).toFixed(2);
}

function numero(value: unknown): number {
  return value == null ? 0 : Number(value);
}

function pct(value: unknown): number | null {
  return value == null ? null : Number(new Prisma.Decimal(String(value)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Shared SQL building blocks
// ---------------------------------------------------------------------------

const JOIN_PAGOS = Prisma.sql`
  INNER JOIN cobradores c ON c.id = p.cobrador_id
  INNER JOIN cuentas_recaudadoras cr ON cr.id = p.cuenta_recaudadora_id
  INNER JOIN bancos b ON b.id = cr.banco_id
`;

/**
 * Builds the payment WHERE clause for the raw-SQL reports.
 *
 * Every option is OPT-IN and defaults to `false`, so each SQL report keeps its
 * previous behaviour unless it asks for more:
 * - `conFechaMovimiento`: bank movement date range, supported ONLY by `cobros`.
 * - `conClasificacionAntiguedad`: movement-derived vintage bucket, supported
 *   ONLY by `cobros` (the Prisma path resolves the ids and passes them along).
 * - `soloFuenteMovimiento`: restricts to the persisted movement-derived verdict,
 *   used by `nuevo-viejo`.
 * While the movement date range or the classification filter is active, a
 * payment with NO linked movement is EXCLUDED.
 */
function wherePagosSql(
  f: ReportFilters,
  estadoForzado?: string,
  opciones?: { conFechaMovimiento?: boolean; conClasificacionAntiguedad?: boolean; soloFuenteMovimiento?: boolean },
): Prisma.Sql {
  const conds: Prisma.Sql[] = [];
  const estado = estadoForzado ?? f.estado;
  if (estado) conds.push(Prisma.sql`p.estado = ${estado}`);
  if (f.fechaDesde) conds.push(Prisma.sql`p.fecha_pago >= ${inicioDiaUTC(f.fechaDesde)!}`);
  if (f.fechaHasta) conds.push(Prisma.sql`p.fecha_pago < ${finDiaUTC(f.fechaHasta)!}`);
  if (f.cobradorId) conds.push(Prisma.sql`p.cobrador_id = ${f.cobradorId}`);
  if (f.bancoId) conds.push(Prisma.sql`cr.banco_id = ${f.bancoId}`);
  // Opt-in bank-movement date range. When active, a payment with NO linked
  // movement is EXCLUDED: a date filter on a relation must not silently keep
  // rows that have no such date.
  if (opciones?.conFechaMovimiento && (f.fechaMovimientoDesde || f.fechaMovimientoHasta)) {
    const movConds: Prisma.Sql[] = [Prisma.sql`mb.id = p.movimiento_banco_id`];
    if (f.fechaMovimientoDesde) {
      movConds.push(Prisma.sql`mb.fecha_ejecucion >= ${inicioDiaUTC(f.fechaMovimientoDesde)!}`);
    }
    if (f.fechaMovimientoHasta) {
      movConds.push(Prisma.sql`mb.fecha_ejecucion < ${finDiaUTC(f.fechaMovimientoHasta)!}`);
    }
    conds.push(
      Prisma.sql`EXISTS (SELECT 1 FROM movimientos_banco mb WHERE ${Prisma.join(movConds, ' AND ')})`,
    );
  }
  // Opt-in classification filter. Same discipline as the movement date range: a
  // payment with NO linked movement is EXCLUDED (the correlated EXISTS is false).
  if (opciones?.conClasificacionAntiguedad && f.clasificacionAntiguedad) {
    conds.push(condicionClasificacionAntiguedadSql(f.clasificacionAntiguedad));
  }
  // Restricts to payments whose vintage verdict was derived from a linked bank
  // movement. Used by `nuevo-viejo`: a payment with no movement-derived verdict
  // is EXCLUDED (neither nuevo nor viejo), never bucketed by the collector mark.
  if (opciones?.soloFuenteMovimiento) {
    conds.push(Prisma.sql`p.fuente_derivacion = 'movimiento'`);
  }
  if (conds.length === 0) conds.push(Prisma.sql`1 = 1`);
  return Prisma.sql`${Prisma.join(conds, ' AND ')}`;
}

/**
 * Resolves the ids that satisfy the opt-in classification filter, using the
 * SAME raw EXISTS shape as `wherePagosSql`. The Prisma path cannot express a
 * per-row column comparison against a relation, so `cobros` feeds these ids
 * into its Prisma `WHERE id IN (...)`. A payment with NO linked movement yields
 * no id here, so it is excluded while the filter is active.
 */
async function idsClasificacionAntiguedad(f: ReportFilters): Promise<number[]> {
  const where = wherePagosSql(f, f.estado, {
    conFechaMovimiento: true,
    conClasificacionAntiguedad: true,
  });
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT p.id FROM pagos_reportados p ${JOIN_PAGOS} WHERE ${where}
  `);
  return rows.map((r) => Number(r.id));
}

function whereGastosSql(f: ReportFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [];
  if (f.fechaDesde) conds.push(Prisma.sql`g.fecha >= ${inicioDiaUTC(f.fechaDesde)!}`);
  if (f.fechaHasta) conds.push(Prisma.sql`g.fecha < ${finDiaUTC(f.fechaHasta)!}`);
  if (conds.length === 0) conds.push(Prisma.sql`1 = 1`);
  return Prisma.sql`${Prisma.join(conds, ' AND ')}`;
}

function whereGastosPrisma(f: ReportFilters): Prisma.GastoWhereInput {
  const where: Prisma.GastoWhereInput = {};
  const desde = inicioDiaUTC(f.fechaDesde);
  const hasta = finDiaUTC(f.fechaHasta);
  if (desde || hasta) {
    const fecha: Prisma.DateTimeFilter = {};
    if (desde) fecha.gte = desde;
    if (hasta) fecha.lt = hasta;
    where.fecha = fecha;
  }
  return where;
}

/**
 * Builds the Prisma WHERE for payment reports. `opciones.conFechaMovimiento` and
 * `opciones.conClasificacionAntiguedad` are OPT-IN and default to `false`: only
 * the `cobros` report supports the bank movement date range and the
 * movement-derived vintage filter, so every other caller keeps its previous
 * behaviour. While the movement filter is active, a payment with NO linked
 * movement is EXCLUDED.
 */
function wherePagosPrisma(
  f: ReportFilters,
  opciones?: { conFechaMovimiento?: boolean; conClasificacionAntiguedad?: boolean; idsClasificacionAntiguedad?: number[] },
): Prisma.PagoReportadoWhereInput {
  const where: Prisma.PagoReportadoWhereInput = {};
  const desde = inicioDiaUTC(f.fechaDesde);
  const hasta = finDiaUTC(f.fechaHasta);
  if (desde || hasta) {
    const fechaPago: Prisma.DateTimeFilter = {};
    if (desde) fechaPago.gte = desde;
    if (hasta) fechaPago.lt = hasta;
    where.fechaPago = fechaPago;
  }
  if (f.cobradorId) where.cobradorId = f.cobradorId;
  if (f.bancoId) where.cuentaRecaudadora = { bancoId: f.bancoId };
  if (f.estado) where.estado = f.estado;
  // Opt-in classification filter. The rule is a per-row column comparison
  // against a relation (`DATEDIFF(p.fecha_pago, mb.fecha_ejecucion)` bucketed
  // against 0 / the configured threshold), which Prisma's relation filters
  // cannot express. The caller resolves the matching ids with the SAME raw
  // EXISTS used by `wherePagosSql` (`idsClasificacionAntiguedad`) and passes
  // them here; an empty list means "no payment matches", so a payment with NO
  // linked movement is EXCLUDED exactly like in the SQL path.
  if (opciones?.conClasificacionAntiguedad && f.clasificacionAntiguedad) {
    where.id = { in: opciones.idsClasificacionAntiguedad ?? [] };
  }
  // Opt-in bank-movement date range (relation). When active, payments with NO
  // linked movement are EXCLUDED: a date filter on a relation must not silently
  // keep rows that have no such date.
  if (opciones?.conFechaMovimiento) {
    const movDesde = inicioDiaUTC(f.fechaMovimientoDesde);
    const movHasta = finDiaUTC(f.fechaMovimientoHasta);
    if (movDesde || movHasta) {
      const fechaEjecucion: Prisma.DateTimeFilter = {};
      if (movDesde) fechaEjecucion.gte = movDesde;
      if (movHasta) fechaEjecucion.lt = movHasta;
      where.movimientoBanco = { fechaEjecucion };
    }
  }
  return where;
}

async function contar(query: Prisma.Sql): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: bigint }[]>(query);
  return numero(rows[0]?.total);
}

// ---------------------------------------------------------------------------
// Shared Prisma selections
// ---------------------------------------------------------------------------

const pagoSelect = {
  id: true,
  fechaPago: true,
  referencia: true,
  cliente: true,
  concepto: true,
  estado: true,
  tipoCobro: true,
  tipoCobroDerivado: true,
  montoBs: true,
  montoUsd: true,
  tasa: true,
  cobrador: { select: { id: true, nombre: true, codigo: true } },
  cuentaRecaudadora: {
    select: {
      id: true,
      numeroCuenta: true,
      alias: true,
      banco: { select: { id: true, nombre: true, codigo: true } },
    },
  },
  // Movement execution date drives the "old document" alert (additive field).
  movimientoBanco: { select: { fechaEjecucion: true } },
} satisfies Prisma.PagoReportadoSelect;

type PagoDetalle = Prisma.PagoReportadoGetPayload<{ select: typeof pagoSelect }>;

function serializarPago(row: PagoDetalle) {
  return {
    id: row.id,
    fechaPago: row.fechaPago,
    referencia: row.referencia,
    cliente: row.cliente,
    concepto: row.concepto,
    estado: row.estado,
    tipoCobro: row.tipoCobro,
    tipoCobroDerivado: row.tipoCobroDerivado,
    montoBs: row.montoBs.toString(),
    montoUsd: row.montoUsd.toString(),
    tasa: row.tasa.toString(),
    cobrador: row.cobrador,
    cuentaRecaudadora: row.cuentaRecaudadora,
    // Linked bank movement date (additive). `null` when the payment has no
    // linked movement. Emitted like `fechaPago` (raw Date; JSON serializes it).
    fechaMovimiento: row.movimientoBanco?.fechaEjecucion ?? null,
  };
}

/**
 * "Antigüedad" fields, computed ON THE FLY for the `cobros` report only.
 *
 * Kept OUT of `serializarPago` on purpose: that serializer is shared with
 * `pagos-sin-respaldo`, which must not gain columns. The age is the signed
 * whole-day gap between the collector-reported `fechaPago` and the LINKED bank
 * movement's `fechaEjecucion`; the "viejo" flag uses the tolerance threshold
 * (`cobro.umbral_antiguedad_dias`), resolved ONCE per request by the caller.
 * With no linked movement the row emits `antiguedadDias: null` and
 * `esViejo: false`.
 */
function camposAntiguedad(
  fechaPago: Date,
  fechaEjecucionMovimiento: Date | null,
  umbralAntiguedadDias: number,
) {
  if (!fechaEjecucionMovimiento) {
    return { antiguedadDias: null, esViejo: false };
  }
  const antiguedadDias = antiguedadEnDias(fechaPago, fechaEjecucionMovimiento);
  return {
    antiguedadDias,
    esViejo: esPagoViejo(antiguedadDias, umbralAntiguedadDias),
  };
}

// ---------------------------------------------------------------------------
// 1. Cobros por periodo (detalle + consolidado)
// ---------------------------------------------------------------------------

export async function cobros(f: ReportFilters, params: PaginationParams) {
  // Only this report opts into the bank-movement date and the classification
  // filters. The classification filter is resolved to a set of ids first because
  // Prisma cannot express the per-row DATEDIFF; `idsClasificacionAntiguedad`
  // runs the SAME raw EXISTS.
  const where = wherePagosPrisma(f, {
    conFechaMovimiento: true,
    conClasificacionAntiguedad: true,
    idsClasificacionAntiguedad: f.clasificacionAntiguedad
      ? await idsClasificacionAntiguedad(f)
      : undefined,
  });
  // Config resolved ONCE per request and reused for every row.
  const [rows, total, agg, config] = await Promise.all([
    prisma.pagoReportado.findMany({
      where,
      select: pagoSelect,
      orderBy: { fechaPago: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.pagoReportado.count({ where }),
    prisma.pagoReportado.aggregate({
      where,
      _sum: { montoUsd: true, montoBs: true },
      _count: { _all: true },
    }),
    getConfigValues(),
  ]);

  return {
    ...paginate(
      rows.map((r) => ({
        ...serializarPago(r),
        ...camposAntiguedad(
          r.fechaPago,
          r.movimientoBanco?.fechaEjecucion ?? null,
          config.umbralAntiguedadDias,
        ),
      })),
      total,
      params,
    ),
    consolidado: {
      totalUsd: (agg._sum.montoUsd ?? new Prisma.Decimal(0)).toString(),
      totalBs: (agg._sum.montoBs ?? new Prisma.Decimal(0)).toString(),
      cantidad: agg._count._all,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Por cobrador
// ---------------------------------------------------------------------------

interface PorCobradorRow {
  cobradorId: number;
  cobrador: string;
  cantidad: bigint;
  montoUsd: Prisma.Decimal | null;
  montoBs: Prisma.Decimal | null;
  tasaPromedioPonderada: Prisma.Decimal | null;
  ticketPromedioUsd: Prisma.Decimal | null;
  pctValidado: Prisma.Decimal | null;
  pctRechazado: Prisma.Decimal | null;
}

export async function porCobrador(f: ReportFilters, params: PaginationParams) {
  const where = wherePagosSql(f);
  const [rows, total] = await Promise.all([
    prisma.$queryRaw<PorCobradorRow[]>(Prisma.sql`
      SELECT c.id AS cobradorId,
             c.nombre AS cobrador,
             COUNT(*) AS cantidad,
             COALESCE(SUM(p.monto_usd), 0) AS montoUsd,
             COALESCE(SUM(p.monto_bs), 0) AS montoBs,
             SUM(p.monto_usd * p.tasa) / NULLIF(SUM(p.monto_usd), 0) AS tasaPromedioPonderada,
             COALESCE(SUM(p.monto_usd), 0) / NULLIF(COUNT(*), 0) AS ticketPromedioUsd,
             100 * SUM(CASE WHEN p.estado = 'validado' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS pctValidado,
             100 * SUM(CASE WHEN p.estado = 'rechazado' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) AS pctRechazado
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      WHERE ${where}
      GROUP BY c.id, c.nombre
      ORDER BY montoUsd DESC
      LIMIT ${params.take} OFFSET ${params.skip}
    `),
    contar(Prisma.sql`
      SELECT COUNT(DISTINCT p.cobrador_id) AS total
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      WHERE ${where}
    `),
  ]);

  const data = rows.map((r) => ({
    cobradorId: r.cobradorId,
    cobrador: r.cobrador,
    cantidad: numero(r.cantidad),
    montoUsd: money(r.montoUsd),
    montoBs: money(r.montoBs),
    ticketPromedioUsd: money(r.ticketPromedioUsd),
    tasaPromedioPonderada: r.tasaPromedioPonderada
      ? Number(new Prisma.Decimal(String(r.tasaPromedioPonderada)).toFixed(6))
      : null,
    pctValidado: pct(r.pctValidado),
    pctRechazado: pct(r.pctRechazado),
  }));

  return paginate(data, total, params);
}

// ---------------------------------------------------------------------------
// 3. Nuevo vs viejo
// ---------------------------------------------------------------------------

interface NuevoViejoResumenRow {
  tipo: string;
  cantidad: bigint;
  montoUsd: Prisma.Decimal | null;
  montoBs: Prisma.Decimal | null;
  participacionPct: Prisma.Decimal | null;
}

interface NuevoViejoDiaRow {
  fecha: string;
  nuevoUsd: Prisma.Decimal | null;
  viejoUsd: Prisma.Decimal | null;
  nuevoCantidad: bigint;
  viejoCantidad: bigint;
}

export async function nuevoViejo(f: ReportFilters, params: PaginationParams) {
  // Read the PERSISTED movement-derived verdict, not the collector's mark: group
  // by `tipo_cobro_derivado` and restrict to rows derived from a linked movement.
  // A payment with no movement-derived verdict is EXCLUDED (neither nuevo nor
  // viejo); it is never bucketed by `tipo_cobro`.
  const where = wherePagosSql(f, f.estado ?? 'validado', { soloFuenteMovimiento: true });

  const [resumenRows, evolucion, total] = await Promise.all([
    prisma.$queryRaw<NuevoViejoResumenRow[]>(Prisma.sql`
      SELECT tipo,
             cantidad,
             montoUsd,
             montoBs,
             ROUND(100 * montoUsd / NULLIF(SUM(montoUsd) OVER (), 0), 2) AS participacionPct
      FROM (
        SELECT p.tipo_cobro_derivado AS tipo,
               COUNT(*) AS cantidad,
               COALESCE(SUM(p.monto_usd), 0) AS montoUsd,
               COALESCE(SUM(p.monto_bs), 0) AS montoBs
        FROM pagos_reportados p
        ${JOIN_PAGOS}
        WHERE ${where}
        GROUP BY p.tipo_cobro_derivado
      ) t
    `),
    prisma.$queryRaw<NuevoViejoDiaRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(p.fecha_pago, '%Y-%m-%d') AS fecha,
             COALESCE(SUM(CASE WHEN p.tipo_cobro_derivado = 'nuevo' THEN p.monto_usd ELSE 0 END), 0) AS nuevoUsd,
             COALESCE(SUM(CASE WHEN p.tipo_cobro_derivado = 'viejo' THEN p.monto_usd ELSE 0 END), 0) AS viejoUsd,
             SUM(CASE WHEN p.tipo_cobro_derivado = 'nuevo' THEN 1 ELSE 0 END) AS nuevoCantidad,
             SUM(CASE WHEN p.tipo_cobro_derivado = 'viejo' THEN 1 ELSE 0 END) AS viejoCantidad
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      WHERE ${where}
      GROUP BY DATE_FORMAT(p.fecha_pago, '%Y-%m-%d')
      ORDER BY fecha ASC
      LIMIT ${params.take} OFFSET ${params.skip}
    `),
    contar(Prisma.sql`
      SELECT COUNT(DISTINCT DATE_FORMAT(p.fecha_pago, '%Y-%m-%d')) AS total
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      WHERE ${where}
    `),
  ]);

  const vacio = { cantidad: 0, montoUsd: '0.00', montoBs: '0.00', participacionPct: 0 };
  const resumen: Record<'nuevo' | 'viejo', typeof vacio> = {
    nuevo: { ...vacio },
    viejo: { ...vacio },
  };
  for (const r of resumenRows) {
    if (r.tipo === 'nuevo' || r.tipo === 'viejo') {
      resumen[r.tipo] = {
        cantidad: numero(r.cantidad),
        montoUsd: money(r.montoUsd),
        montoBs: money(r.montoBs),
        participacionPct: pct(r.participacionPct) ?? 0,
      };
    }
  }

  const data = evolucion.map((r) => ({
    fecha: r.fecha,
    nuevoUsd: money(r.nuevoUsd),
    viejoUsd: money(r.viejoUsd),
    nuevoCantidad: numero(r.nuevoCantidad),
    viejoCantidad: numero(r.viejoCantidad),
  }));

  return { ...paginate(data, total, params), resumen };
}

// ---------------------------------------------------------------------------
// 4. Analisis de tasa
// ---------------------------------------------------------------------------

interface TasaDiaRow {
  fecha: string;
  cantidad: bigint;
  montoUsd: Prisma.Decimal | null;
  montoBs: Prisma.Decimal | null;
  tasaImplicita: Prisma.Decimal | null;
  tasaReferencia: Prisma.Decimal | null;
}

interface TasaCobradorRow {
  cobradorId: number;
  cobrador: string;
  cantidad: bigint;
  montoUsd: Prisma.Decimal | null;
  tasaImplicita: Prisma.Decimal | null;
}

export async function tasas(f: ReportFilters, params: PaginationParams) {
  const where = wherePagosSql(f, f.estado ?? 'validado');

  const [porDiaRows, porCobradorRows, total] = await Promise.all([
    prisma.$queryRaw<TasaDiaRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(p.fecha_pago, '%Y-%m-%d') AS fecha,
             COUNT(*) AS cantidad,
             COALESCE(SUM(p.monto_usd), 0) AS montoUsd,
             COALESCE(SUM(p.monto_bs), 0) AS montoBs,
             SUM(p.monto_usd * p.tasa) / NULLIF(SUM(p.monto_usd), 0) AS tasaImplicita,
             MAX(tr.valor) AS tasaReferencia
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      LEFT JOIN tasas_referencia tr
        ON tr.fecha = p.fecha_pago
      WHERE ${where}
      GROUP BY DATE_FORMAT(p.fecha_pago, '%Y-%m-%d')
      ORDER BY fecha ASC
      LIMIT ${params.take} OFFSET ${params.skip}
    `),
    prisma.$queryRaw<TasaCobradorRow[]>(Prisma.sql`
      SELECT c.id AS cobradorId,
             c.nombre AS cobrador,
             COUNT(*) AS cantidad,
             COALESCE(SUM(p.monto_usd), 0) AS montoUsd,
             SUM(p.monto_usd * p.tasa) / NULLIF(SUM(p.monto_usd), 0) AS tasaImplicita
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      WHERE ${where}
      GROUP BY c.id, c.nombre
      ORDER BY montoUsd DESC
    `),
    contar(Prisma.sql`
      SELECT COUNT(DISTINCT DATE_FORMAT(p.fecha_pago, '%Y-%m-%d')) AS total
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      WHERE ${where}
    `),
  ]);

  const porDia = porDiaRows.map((r) => {
    const desviacion = desviacionPorcentual(r.tasaImplicita ?? 0, r.tasaReferencia);
    return {
      fecha: r.fecha,
      cantidad: numero(r.cantidad),
      montoUsd: money(r.montoUsd),
      montoBs: money(r.montoBs),
      tasaImplicita: r.tasaImplicita
        ? Number(new Prisma.Decimal(String(r.tasaImplicita)).toFixed(6))
        : null,
      tasaReferencia: r.tasaReferencia
        ? Number(new Prisma.Decimal(String(r.tasaReferencia)).toFixed(6))
        : null,
      desviacionPct: desviacion,
      atipico: desviacion != null && Math.abs(desviacion) > 20,
    };
  });

  // Weighted reference rate over the filtered window (single DB aggregate).
  const refConds: Prisma.Sql[] = [];
  if (f.fechaDesde) refConds.push(Prisma.sql`fecha >= ${inicioDiaUTC(f.fechaDesde)!}`);
  if (f.fechaHasta) refConds.push(Prisma.sql`fecha < ${finDiaUTC(f.fechaHasta)!}`);
  if (refConds.length === 0) refConds.push(Prisma.sql`1 = 1`);
  const refRows = await prisma.$queryRaw<{ promedio: Prisma.Decimal | null }[]>(Prisma.sql`
    SELECT AVG(valor) AS promedio FROM tasas_referencia WHERE ${Prisma.join(refConds, ' AND ')}
  `);
  const referenciaPromedio = refRows[0]?.promedio ?? null;

  const porCobrador = porCobradorRows.map((r) => {
    const desviacion = desviacionPorcentual(r.tasaImplicita ?? 0, referenciaPromedio);
    return {
      cobradorId: r.cobradorId,
      cobrador: r.cobrador,
      cantidad: numero(r.cantidad),
      montoUsd: money(r.montoUsd),
      tasaImplicita: r.tasaImplicita
        ? Number(new Prisma.Decimal(String(r.tasaImplicita)).toFixed(6))
        : null,
      desviacionPct: desviacion,
      atipico: desviacion != null && Math.abs(desviacion) > 20,
    };
  });

  // Overall weighted rate from the (bounded) daily series, via the shared helper.
  const tasaImplicitaGlobal = tasaPromedioPonderada(
    porDiaRows.map((r) => ({
      montoUsd: r.montoUsd ?? 0,
      tasa: r.tasaImplicita ?? 0,
    })),
  );

  return {
    ...paginate(porDia, total, params),
    resumen: {
      tasaImplicitaGlobal,
      tasaReferenciaPromedio: referenciaPromedio
        ? Number(new Prisma.Decimal(String(referenciaPromedio)).toFixed(6))
        : null,
      diasAtipicos: porDia.filter((d) => d.atipico).length,
    },
    porCobrador,
  };
}

// ---------------------------------------------------------------------------
// 5. Pendientes de validacion
// ---------------------------------------------------------------------------

interface PendienteRow {
  id: number;
  fechaPago: Date;
  referencia: string;
  cobrador: string;
  banco: string;
  montoBs: Prisma.Decimal;
  montoUsd: Prisma.Decimal;
  tasa: Prisma.Decimal;
  antiguedadHoras: bigint;
  antiguedadDias: Prisma.Decimal | null;
}

export async function pendientes(f: ReportFilters, params: PaginationParams) {
  const where = wherePagosSql(f, 'pendiente');

  const [rows, total] = await Promise.all([
    prisma.$queryRaw<PendienteRow[]>(Prisma.sql`
      SELECT p.id,
             p.fecha_pago AS fechaPago,
             p.referencia,
             c.nombre AS cobrador,
             b.nombre AS banco,
             p.monto_bs AS montoBs,
             p.monto_usd AS montoUsd,
             p.tasa,
             TIMESTAMPDIFF(HOUR, p.created_at, UTC_TIMESTAMP()) AS antiguedadHoras,
             ROUND(TIMESTAMPDIFF(HOUR, p.created_at, UTC_TIMESTAMP()) / 24, 1) AS antiguedadDias
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      WHERE ${where}
      ORDER BY antiguedadHoras DESC
      LIMIT ${params.take} OFFSET ${params.skip}
    `),
    contar(Prisma.sql`
      SELECT COUNT(*) AS total FROM pagos_reportados p ${JOIN_PAGOS} WHERE ${where}
    `),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    fechaPago: r.fechaPago,
    referencia: r.referencia,
    cobrador: r.cobrador,
    banco: r.banco,
    montoBs: r.montoBs.toString(),
    montoUsd: r.montoUsd.toString(),
    tasa: r.tasa.toString(),
    antiguedadHoras: numero(r.antiguedadHoras),
    antiguedadDias: r.antiguedadDias
      ? Number(new Prisma.Decimal(String(r.antiguedadDias)).toFixed(1))
      : 0,
  }));

  return paginate(data, total, params);
}

// ---------------------------------------------------------------------------
// 6. Movimientos bancarios no conciliados
// ---------------------------------------------------------------------------

const movimientoSelect = {
  id: true,
  referencia: true,
  montoBs: true,
  fechaEjecucion: true,
  estadoConciliacion: true,
  createdAt: true,
  cuentaRecaudadora: {
    select: {
      id: true,
      numeroCuenta: true,
      alias: true,
      banco: { select: { id: true, nombre: true, codigo: true } },
    },
  },
  lote: { select: { id: true, nombreArchivo: true } },
} satisfies Prisma.MovimientoBancoSelect;

type MovimientoDetalle = Prisma.MovimientoBancoGetPayload<{ select: typeof movimientoSelect }>;

export async function movimientosNoConciliados(f: ReportFilters, params: PaginationParams) {
  const where: Prisma.MovimientoBancoWhereInput = {
    estadoConciliacion: 'no_conciliado',
  };
  const desde = inicioDiaUTC(f.fechaDesde);
  const hasta = finDiaUTC(f.fechaHasta);
  if (desde || hasta) {
    const fechaEjecucion: Prisma.DateTimeFilter = {};
    if (desde) fechaEjecucion.gte = desde;
    if (hasta) fechaEjecucion.lt = hasta;
    where.fechaEjecucion = fechaEjecucion;
  }
  if (f.bancoId) where.cuentaRecaudadora = { bancoId: f.bancoId };

  const [rows, agg] = await Promise.all([
    prisma.movimientoBanco.findMany({
      where,
      select: movimientoSelect,
      orderBy: { fechaEjecucion: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.movimientoBanco.aggregate({
      where,
      _count: { _all: true },
      _sum: { montoBs: true },
    }),
  ]);

  const data = (rows as MovimientoDetalle[]).map((r) => ({
    ...r,
    montoBs: r.montoBs.toString(),
  }));

  return {
    ...paginate(data, agg._count._all, params),
    totales: {
      cantidad: agg._count._all,
      totalBs: money(agg._sum.montoBs),
    },
  };
}

// ---------------------------------------------------------------------------
// 7. Pagos reportados sin respaldo bancario
// ---------------------------------------------------------------------------

export async function pagosSinRespaldo(f: ReportFilters, params: PaginationParams) {
  const where: Prisma.PagoReportadoWhereInput = {
    ...wherePagosPrisma(f),
    movimientoBancoId: null,
  };

  const [rows, total] = await Promise.all([
    prisma.pagoReportado.findMany({
      where,
      select: pagoSelect,
      orderBy: { fechaPago: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.pagoReportado.count({ where }),
  ]);

  return paginate(rows.map((r) => serializarPago(r)), total, params);
}

// ---------------------------------------------------------------------------
// 8. Flujo de caja
// ---------------------------------------------------------------------------

interface FlujoIngresoRow {
  fecha: string;
  ingresosUsd: Prisma.Decimal | null;
  ingresosBs: Prisma.Decimal | null;
  cantidad: bigint;
}

interface FlujoGastoRow {
  fecha: string;
  gastosUsd: Prisma.Decimal | null;
  gastosBs: Prisma.Decimal | null;
  cantidad: bigint;
}

export async function flujoCaja(f: ReportFilters, params: PaginationParams) {
  const wherePagos = wherePagosSql(f, 'validado');
  const whereGastos = whereGastosSql(f);

  const [ingresos, gastos, totalIngresos, totalGastosUsd, totalGastosBs] = await Promise.all([
    prisma.$queryRaw<FlujoIngresoRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(p.fecha_pago, '%Y-%m-%d') AS fecha,
             COALESCE(SUM(p.monto_usd), 0) AS ingresosUsd,
             COALESCE(SUM(p.monto_bs), 0) AS ingresosBs,
             COUNT(*) AS cantidad
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      WHERE ${wherePagos}
      GROUP BY DATE_FORMAT(p.fecha_pago, '%Y-%m-%d')
      ORDER BY fecha ASC
    `),
    prisma.$queryRaw<FlujoGastoRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(g.fecha, '%Y-%m-%d') AS fecha,
             COALESCE(SUM(g.monto_usd), 0) AS gastosUsd,
             COALESCE(SUM(g.monto_bs), 0) AS gastosBs,
             COUNT(*) AS cantidad
      FROM gastos g
      WHERE ${whereGastos}
      GROUP BY DATE_FORMAT(g.fecha, '%Y-%m-%d')
      ORDER BY fecha ASC
    `),
    prisma.$queryRaw<{ totalUsd: Prisma.Decimal | null; totalBs: Prisma.Decimal | null }[]>(Prisma.sql`
      SELECT COALESCE(SUM(p.monto_usd), 0) AS totalUsd, COALESCE(SUM(p.monto_bs), 0) AS totalBs
      FROM pagos_reportados p
      ${JOIN_PAGOS}
      WHERE ${wherePagos}
    `),
    gastosService.sumGastosUsd(whereGastosPrisma(f)),
    gastosService.sumGastosBs(whereGastosPrisma(f)),
  ]);

  const dias = new Map<
    string,
    { fecha: string; ingresosUsd: number; ingresosBs: number; gastosUsd: number; gastosBs: number }
  >();
  const getDia = (fecha: string) => {
    let d = dias.get(fecha);
    if (!d) {
      d = { fecha, ingresosUsd: 0, ingresosBs: 0, gastosUsd: 0, gastosBs: 0 };
      dias.set(fecha, d);
    }
    return d;
  };
  for (const r of ingresos) {
    const d = getDia(r.fecha);
    d.ingresosUsd += numero(r.ingresosUsd);
    d.ingresosBs += numero(r.ingresosBs);
  }
  for (const r of gastos) {
    const d = getDia(r.fecha);
    d.gastosUsd += numero(r.gastosUsd);
    d.gastosBs += numero(r.gastosBs);
  }

  const ordenados = [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acumuladoUsd = 0;
  let acumuladoBs = 0;
  const completo = ordenados.map((d) => {
    const flujoUsd = d.ingresosUsd - d.gastosUsd;
    const flujoBs = d.ingresosBs - d.gastosBs;
    acumuladoUsd += flujoUsd;
    acumuladoBs += flujoBs;
    return {
      fecha: d.fecha,
      ingresosUsd: money(d.ingresosUsd),
      ingresosBs: money(d.ingresosBs),
      gastosUsd: money(d.gastosUsd),
      gastosBs: money(d.gastosBs),
      flujoUsd: money(flujoUsd),
      flujoBs: money(flujoBs),
      acumuladoUsd: money(acumuladoUsd),
      acumuladoBs: money(acumuladoBs),
    };
  });

  const total = completo.length;
  const pagina = completo.slice(params.skip, params.skip + params.take);

  return {
    ...paginate(pagina, total, params),
    totales: {
      ingresosUsd: (totalIngresos[0]?.totalUsd ?? new Prisma.Decimal(0)).toString(),
      ingresosBs: (totalIngresos[0]?.totalBs ?? new Prisma.Decimal(0)).toString(),
      gastosUsd: totalGastosUsd.toString(),
      gastosBs: totalGastosBs.toString(),
      flujoUsd: new Prisma.Decimal(totalIngresos[0]?.totalUsd ?? 0).minus(totalGastosUsd).toString(),
      flujoBs: new Prisma.Decimal(totalIngresos[0]?.totalBs ?? 0).minus(totalGastosBs).toString(),
    },
  };
}

// ---------------------------------------------------------------------------
// 9. Gastos por categoria y por autorizante
// ---------------------------------------------------------------------------

interface GastoCategoriaRow {
  categoria: string;
  cantidad: bigint;
  totalUsd: Prisma.Decimal | null;
  totalBs: Prisma.Decimal | null;
}

interface GastoAutorizadorRow {
  autorizadoPor: string;
  cantidad: bigint;
  totalUsd: Prisma.Decimal | null;
  totalBs: Prisma.Decimal | null;
}

async function gastosPorCategoria(f: ReportFilters, params: PaginationParams) {
  const where = whereGastosSql(f);
  const [rows, total] = await Promise.all([
    prisma.$queryRaw<GastoCategoriaRow[]>(Prisma.sql`
      SELECT g.categoria,
             COUNT(*) AS cantidad,
             COALESCE(SUM(g.monto_usd), 0) AS totalUsd,
             COALESCE(SUM(g.monto_bs), 0) AS totalBs
      FROM gastos g
      WHERE ${where}
      GROUP BY g.categoria
      ORDER BY totalUsd DESC
      LIMIT ${params.take} OFFSET ${params.skip}
    `),
    contar(Prisma.sql`
      SELECT COUNT(DISTINCT g.categoria) AS total FROM gastos g WHERE ${where}
    `),
  ]);

  const data = rows.map((r) => ({
    categoria: r.categoria,
    cantidad: numero(r.cantidad),
    totalUsd: money(r.totalUsd),
    totalBs: money(r.totalBs),
  }));
  return paginate(data, total, params);
}

async function gastosPorAutorizador(f: ReportFilters) {
  const where = whereGastosSql(f);
  const rows = await prisma.$queryRaw<GastoAutorizadorRow[]>(Prisma.sql`
    SELECT g.autorizado_por AS autorizadoPor,
           COUNT(*) AS cantidad,
           COALESCE(SUM(g.monto_usd), 0) AS totalUsd,
           COALESCE(SUM(g.monto_bs), 0) AS totalBs
    FROM gastos g
    WHERE ${where}
    GROUP BY g.autorizado_por
    ORDER BY totalUsd DESC
  `);
  return rows.map((r) => ({
    autorizadoPor: r.autorizadoPor,
    cantidad: numero(r.cantidad),
    totalUsd: money(r.totalUsd),
    totalBs: money(r.totalBs),
  }));
}

export async function gastos(f: ReportFilters, params: PaginationParams) {
  const [porCategoria, porAutorizadoPor] = await Promise.all([
    gastosPorCategoria(f, params),
    gastosPorAutorizador(f),
  ]);
  return { ...porCategoria, porAutorizadoPor };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export interface ColumnDef {
  key: string;
  label: string;
  width?: number;
  align?: 'left' | 'right';
}

export interface ReporteBloque {
  nombre: string;
  columnas: ColumnDef[];
  filas: Record<string, unknown>[];
}

export interface ReporteExportable {
  titulo: string;
  bloques: ReporteBloque[];
}

const TITULOS: Record<TipoReporte, string> = {
  cobros: 'Cobros por periodo',
  'por-cobrador': 'Cobros por cobrador',
  'nuevo-viejo': 'Cobros nuevo vs viejo',
  tasas: 'Analisis de tasa',
  pendientes: 'Pendientes de validacion',
  'movimientos-no-conciliados': 'Movimientos bancarios no conciliados',
  'pagos-sin-respaldo': 'Pagos reportados sin respaldo bancario',
  'flujo-caja': 'Flujo de caja',
  gastos: 'Gastos',
};

/**
 * Builds the export payload by REUSING the same query functions that back the
 * JSON endpoints; only the pagination window changes (all rows).
 */
export async function datosParaExport(
  tipo: TipoReporte,
  f: ReportFilters,
): Promise<ReporteExportable> {
  switch (tipo) {
    case 'cobros': {
      const r = await cobros(f, SIN_LIMITE);
      return {
        titulo: TITULOS[tipo],
        bloques: [
          {
            nombre: 'Cobros',
            columnas: [
              { key: 'fechaPago', label: 'Fecha' },
              { key: 'fechaMovimiento', label: 'Fecha movimiento' },
              { key: 'referencia', label: 'Referencia' },
              { key: 'cobradorNombre', label: 'Cobrador' },
              { key: 'banco', label: 'Banco' },
              { key: 'montoBs', label: 'Monto Bs', align: 'right' },
              { key: 'montoUsd', label: 'Monto USD', align: 'right' },
              { key: 'tasa', label: 'Tasa', align: 'right' },
              { key: 'antiguedad', label: 'Antigüedad' },
              { key: 'viejo', label: 'Viejo' },
              { key: 'estado', label: 'Estado' },
              { key: 'tipoCobro', label: 'Tipo' },
            ],
            filas: r.data.map((row) => ({
              ...row,
              cobradorNombre: row.cobrador?.nombre ?? '',
              banco: row.cuentaRecaudadora?.banco?.nombre ?? '',
              // No linked movement => no age to show (empty cell, not "null días").
              antiguedad: row.antiguedadDias != null ? `${row.antiguedadDias} días` : '',
              viejo: row.esViejo ? 'Sí' : '',
            })),
          },
        ],
      };
    }
    case 'por-cobrador': {
      const r = await porCobrador(f, SIN_LIMITE);
      return {
        titulo: TITULOS[tipo],
        bloques: [
          {
            nombre: 'Por cobrador',
            columnas: [
              { key: 'cobrador', label: 'Cobrador' },
              { key: 'cantidad', label: 'Cantidad', align: 'right' },
              { key: 'montoUsd', label: 'Monto USD', align: 'right' },
              { key: 'montoBs', label: 'Monto Bs', align: 'right' },
              { key: 'ticketPromedioUsd', label: 'Ticket promedio USD', align: 'right' },
              { key: 'tasaPromedioPonderada', label: 'Tasa promedio', align: 'right' },
              { key: 'pctValidado', label: '% validado', align: 'right' },
              { key: 'pctRechazado', label: '% rechazado', align: 'right' },
            ],
            filas: r.data,
          },
        ],
      };
    }
    case 'nuevo-viejo': {
      const r = await nuevoViejo(f, SIN_LIMITE);
      return {
        titulo: TITULOS[tipo],
        bloques: [
          {
            nombre: 'Resumen',
            columnas: [
              { key: 'tipo', label: 'Tipo' },
              { key: 'cantidad', label: 'Cantidad', align: 'right' },
              { key: 'montoUsd', label: 'Monto USD', align: 'right' },
              { key: 'montoBs', label: 'Monto Bs', align: 'right' },
              { key: 'participacionPct', label: 'Participacion %', align: 'right' },
            ],
            filas: [
              { tipo: 'nuevo', ...r.resumen.nuevo },
              { tipo: 'viejo', ...r.resumen.viejo },
            ],
          },
          {
            nombre: 'Evolucion',
            columnas: [
              { key: 'fecha', label: 'Fecha' },
              { key: 'nuevoUsd', label: 'Nuevo USD', align: 'right' },
              { key: 'viejoUsd', label: 'Viejo USD', align: 'right' },
              { key: 'nuevoCantidad', label: 'Nuevo cant.', align: 'right' },
              { key: 'viejoCantidad', label: 'Viejo cant.', align: 'right' },
            ],
            filas: r.data,
          },
        ],
      };
    }
    case 'tasas': {
      const r = await tasas(f, SIN_LIMITE);
      return {
        titulo: TITULOS[tipo],
        bloques: [
          {
            nombre: 'Por dia',
            columnas: [
              { key: 'fecha', label: 'Fecha' },
              { key: 'cantidad', label: 'Cantidad', align: 'right' },
              { key: 'montoUsd', label: 'Monto USD', align: 'right' },
              { key: 'tasaImplicita', label: 'Tasa implicita', align: 'right' },
              { key: 'tasaReferencia', label: 'Tasa referencia', align: 'right' },
              { key: 'desviacionPct', label: 'Desviacion %', align: 'right' },
              { key: 'atipico', label: 'Atipico' },
            ],
            filas: r.data,
          },
          {
            nombre: 'Por cobrador',
            columnas: [
              { key: 'cobrador', label: 'Cobrador' },
              { key: 'cantidad', label: 'Cantidad', align: 'right' },
              { key: 'montoUsd', label: 'Monto USD', align: 'right' },
              { key: 'tasaImplicita', label: 'Tasa implicita', align: 'right' },
              { key: 'desviacionPct', label: 'Desviacion %', align: 'right' },
              { key: 'atipico', label: 'Atipico' },
            ],
            filas: r.porCobrador,
          },
        ],
      };
    }
    case 'pendientes': {
      const r = await pendientes(f, SIN_LIMITE);
      return {
        titulo: TITULOS[tipo],
        bloques: [
          {
            nombre: 'Pendientes',
            columnas: [
              { key: 'fechaPago', label: 'Fecha pago' },
              { key: 'antiguedadHoras', label: 'Antiguedad (h)', align: 'right' },
              { key: 'antiguedadDias', label: 'Antiguedad (d)', align: 'right' },
              { key: 'cobrador', label: 'Cobrador' },
              { key: 'banco', label: 'Banco' },
              { key: 'referencia', label: 'Referencia' },
              { key: 'montoUsd', label: 'Monto USD', align: 'right' },
              { key: 'montoBs', label: 'Monto Bs', align: 'right' },
            ],
            filas: r.data,
          },
        ],
      };
    }
    case 'movimientos-no-conciliados': {
      const r = await movimientosNoConciliados(f, SIN_LIMITE);
      return {
        titulo: TITULOS[tipo],
        bloques: [
          {
            nombre: 'Movimientos',
            columnas: [
              { key: 'fechaEjecucion', label: 'Fecha ejecucion' },
              { key: 'referencia', label: 'Referencia' },
              { key: 'banco', label: 'Banco' },
              { key: 'cuenta', label: 'Cuenta' },
              { key: 'montoBs', label: 'Monto Bs', align: 'right' },
            ],
            filas: r.data.map((row) => ({
              ...row,
              banco: row.cuentaRecaudadora?.banco?.nombre ?? '',
              cuenta: row.cuentaRecaudadora?.numeroCuenta ?? '',
            })),
          },
        ],
      };
    }
    case 'pagos-sin-respaldo': {
      const r = await pagosSinRespaldo(f, SIN_LIMITE);
      return {
        titulo: TITULOS[tipo],
        bloques: [
          {
            nombre: 'Pagos sin respaldo',
            columnas: [
              { key: 'fechaPago', label: 'Fecha pago' },
              { key: 'referencia', label: 'Referencia' },
              { key: 'cobradorNombre', label: 'Cobrador' },
              { key: 'banco', label: 'Banco' },
              { key: 'montoUsd', label: 'Monto USD', align: 'right' },
              { key: 'montoBs', label: 'Monto Bs', align: 'right' },
              { key: 'estado', label: 'Estado' },
            ],
            filas: r.data.map((row) => ({
              ...row,
              cobradorNombre: row.cobrador?.nombre ?? '',
              banco: row.cuentaRecaudadora?.banco?.nombre ?? '',
            })),
          },
        ],
      };
    }
    case 'flujo-caja': {
      const r = await flujoCaja(f, SIN_LIMITE);
      return {
        titulo: TITULOS[tipo],
        bloques: [
          {
            nombre: 'Flujo de caja',
            columnas: [
              { key: 'fecha', label: 'Fecha' },
              { key: 'ingresosUsd', label: 'Ingresos USD', align: 'right' },
              { key: 'gastosUsd', label: 'Gastos USD', align: 'right' },
              { key: 'flujoUsd', label: 'Flujo USD', align: 'right' },
              { key: 'acumuladoUsd', label: 'Acumulado USD', align: 'right' },
              { key: 'ingresosBs', label: 'Ingresos Bs', align: 'right' },
              { key: 'gastosBs', label: 'Gastos Bs', align: 'right' },
              { key: 'flujoBs', label: 'Flujo Bs', align: 'right' },
            ],
            filas: r.data,
          },
        ],
      };
    }
    case 'gastos': {
      const r = await gastos(f, SIN_LIMITE);
      return {
        titulo: TITULOS[tipo],
        bloques: [
          {
            nombre: 'Por categoria',
            columnas: [
              { key: 'categoria', label: 'Categoria' },
              { key: 'cantidad', label: 'Cantidad', align: 'right' },
              { key: 'totalUsd', label: 'Total USD', align: 'right' },
              { key: 'totalBs', label: 'Total Bs', align: 'right' },
            ],
            filas: r.data,
          },
          {
            nombre: 'Por autorizante',
            columnas: [
              { key: 'autorizadoPor', label: 'Autorizado por' },
              { key: 'cantidad', label: 'Cantidad', align: 'right' },
              { key: 'totalUsd', label: 'Total USD', align: 'right' },
              { key: 'totalBs', label: 'Total Bs', align: 'right' },
            ],
            filas: r.porAutorizadoPor,
          },
        ],
      };
    }
    default: {
      const _exhaustivo: never = tipo;
      throw new Error(`Reporte no soportado: ${String(_exhaustivo)}`);
    }
  }
}

function celda(valor: unknown): string | number {
  if (valor == null) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'number' || typeof valor === 'string') return valor;
  if (typeof valor === 'bigint') return Number(valor);
  if (typeof valor === 'boolean') return valor ? 'Si' : 'No';
  return String(valor);
}

export async function generarExcel(bloques: ReporteBloque[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema de Gestion de Cobros';
  for (const bloque of bloques) {
    const ws = wb.addWorksheet(bloque.nombre.slice(0, 31) || 'Reporte');
    ws.columns = bloque.columnas.map((c) => ({
      header: c.label,
      key: c.key,
      width: c.width ?? 18,
    }));
    for (const fila of bloque.filas) {
      ws.addRow(
        Object.fromEntries(bloque.columnas.map((c) => [c.key, celda(fila[c.key])])),
      );
    }
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle' };
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function generarPdf(
  titulo: string,
  subtitulo: string,
  bloques: ReporteBloque[],
): PDFKit.PDFDocument {
  const margin = 30;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin, autoFirstPage: true });
  const anchoDisponible = doc.page.width - margin * 2;

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111').text(titulo, margin, margin);
  doc.font('Helvetica').fontSize(8).fillColor('#555').text(subtitulo, margin, doc.y + 2);
  doc.moveDown(0.8);

  const filaAlto = 14;

  for (const bloque of bloques) {
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(10).text(bloque.nombre, margin, doc.y);
    doc.moveDown(0.3);

    const pesos = bloque.columnas.map((c) => c.width ?? 18);
    const sumaPesos = pesos.reduce((a, b) => a + b, 0);
    const anchos = pesos.map((p) => (p / sumaPesos) * anchoDisponible);

    const dibujarEncabezado = () => {
      let x = margin;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000');
      bloque.columnas.forEach((col, i) => {
        doc.text(col.label, x + 2, y + 2, {
          width: anchos[i] - 4,
          height: filaAlto,
          ellipsis: true,
          align: col.align ?? 'left',
        });
        x += anchos[i];
      });
      doc.y = y + filaAlto;
      doc
        .moveTo(margin, doc.y)
        .lineTo(margin + anchoDisponible, doc.y)
        .strokeColor('#999')
        .lineWidth(0.5)
        .stroke();
      doc.moveDown(0.2);
    };

    dibujarEncabezado();

    doc.font('Helvetica').fontSize(7.5).fillColor('#111');
    for (const fila of bloque.filas) {
      if (doc.y + filaAlto > doc.page.height - margin) {
        doc.addPage();
        doc.y = margin;
        dibujarEncabezado();
        doc.font('Helvetica').fontSize(7.5).fillColor('#111');
      }
      let x = margin;
      const y = doc.y;
      bloque.columnas.forEach((col, i) => {
        doc.text(String(celda(fila[col.key])), x + 2, y + 2, {
          width: anchos[i] - 4,
          height: filaAlto,
          ellipsis: true,
          align: col.align ?? 'left',
        });
        x += anchos[i];
      });
      doc.y = y + filaAlto;
    }
    doc.moveDown(1);
  }

  return doc;
}
