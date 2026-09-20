import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { paginate, type PaginationParams } from '../../lib/http';
import { desviacionPorcentual, tasaPromedioPonderada } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import * as gastosService from '../gastos/gastos.service';
import type { EstadoPagoFiltro, TipoReporte } from './reportes.schema';

export interface ReportFilters {
  fechaDesde?: string;
  fechaHasta?: string;
  cobradorId?: number;
  bancoId?: number;
  estado?: EstadoPagoFiltro;
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

function wherePagosSql(f: ReportFilters, estadoForzado?: string): Prisma.Sql {
  const conds: Prisma.Sql[] = [];
  const estado = estadoForzado ?? f.estado;
  if (estado) conds.push(Prisma.sql`p.estado = ${estado}`);
  if (f.fechaDesde) conds.push(Prisma.sql`p.fecha_pago >= ${inicioDiaUTC(f.fechaDesde)!}`);
  if (f.fechaHasta) conds.push(Prisma.sql`p.fecha_pago < ${finDiaUTC(f.fechaHasta)!}`);
  if (f.cobradorId) conds.push(Prisma.sql`p.cobrador_id = ${f.cobradorId}`);
  if (f.bancoId) conds.push(Prisma.sql`cr.banco_id = ${f.bancoId}`);
  if (conds.length === 0) conds.push(Prisma.sql`1 = 1`);
  return Prisma.sql`${Prisma.join(conds, ' AND ')}`;
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

function wherePagosPrisma(f: ReportFilters): Prisma.PagoReportadoWhereInput {
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
  };
}

// ---------------------------------------------------------------------------
// 1. Cobros por periodo (detalle + consolidado)
// ---------------------------------------------------------------------------

export async function cobros(f: ReportFilters, params: PaginationParams) {
  const where = wherePagosPrisma(f);
  const [rows, total, agg] = await Promise.all([
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
  ]);

  return {
    ...paginate(rows.map(serializarPago), total, params),
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
  const where = wherePagosSql(f, f.estado ?? 'validado');

  const [resumenRows, evolucion, total] = await Promise.all([
    prisma.$queryRaw<NuevoViejoResumenRow[]>(Prisma.sql`
      SELECT tipo,
             cantidad,
             montoUsd,
             montoBs,
             ROUND(100 * montoUsd / NULLIF(SUM(montoUsd) OVER (), 0), 2) AS participacionPct
      FROM (
        SELECT COALESCE(p.tipo_cobro_derivado, p.tipo_cobro) AS tipo,
               COUNT(*) AS cantidad,
               COALESCE(SUM(p.monto_usd), 0) AS montoUsd,
               COALESCE(SUM(p.monto_bs), 0) AS montoBs
        FROM pagos_reportados p
        ${JOIN_PAGOS}
        WHERE ${where}
        GROUP BY COALESCE(p.tipo_cobro_derivado, p.tipo_cobro)
      ) t
    `),
    prisma.$queryRaw<NuevoViejoDiaRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(p.fecha_pago, '%Y-%m-%d') AS fecha,
             COALESCE(SUM(CASE WHEN COALESCE(p.tipo_cobro_derivado, p.tipo_cobro) = 'nuevo' THEN p.monto_usd ELSE 0 END), 0) AS nuevoUsd,
             COALESCE(SUM(CASE WHEN COALESCE(p.tipo_cobro_derivado, p.tipo_cobro) = 'viejo' THEN p.monto_usd ELSE 0 END), 0) AS viejoUsd,
             SUM(CASE WHEN COALESCE(p.tipo_cobro_derivado, p.tipo_cobro) = 'nuevo' THEN 1 ELSE 0 END) AS nuevoCantidad,
             SUM(CASE WHEN COALESCE(p.tipo_cobro_derivado, p.tipo_cobro) = 'viejo' THEN 1 ELSE 0 END) AS viejoCantidad
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

  const [rows, total] = await Promise.all([
    prisma.movimientoBanco.findMany({
      where,
      select: movimientoSelect,
      orderBy: { fechaEjecucion: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.movimientoBanco.count({ where }),
  ]);

  const data = (rows as MovimientoDetalle[]).map((r) => ({
    ...r,
    montoBs: r.montoBs.toString(),
  }));

  return paginate(data, total, params);
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

  return paginate(rows.map(serializarPago), total, params);
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
              { key: 'referencia', label: 'Referencia' },
              { key: 'cobradorNombre', label: 'Cobrador' },
              { key: 'banco', label: 'Banco' },
              { key: 'montoBs', label: 'Monto Bs', align: 'right' },
              { key: 'montoUsd', label: 'Monto USD', align: 'right' },
              { key: 'tasa', label: 'Tasa', align: 'right' },
              { key: 'estado', label: 'Estado' },
              { key: 'tipoCobro', label: 'Tipo' },
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
