import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getConfigValues, type ConfigValues } from '../../lib/config-values';

/**
 * Reconciliation matching engine (spec section 5.2).
 *
 * Matches a reported payment against un-reconciled bank movements of the same
 * collection account, scoring candidates by:
 *   - reference: exact match, or match on the last N digits (collectors often
 *     report partial references)
 *   - amount in bolivares within a configurable tolerance
 *   - execution date within +/- N days
 *
 * A bank movement can be reconciled with only ONE reported payment; already
 * reconciled movements are excluded from candidates.
 */

export interface PagoParaConciliar {
  referencia: string;
  montoBs: Prisma.Decimal;
  fechaPago: Date;
  cuentaRecaudadoraId: number;
}

export interface MovimientoCandidato {
  id: number;
  referencia: string;
  montoBs: Prisma.Decimal;
  fechaEjecucion: Date;
}

export interface Coincidencia {
  movimiento: MovimientoCandidato;
  puntaje: number; // 0..100
  referenciaExacta: boolean;
  coincidenciaSufijo: boolean;
  diferenciaMontoBs: string;
  diferenciaDias: number;
}

/**
 * Minimum number of digits required to contrast a reference by its trailing
 * suffix (CR-001 R1). A reported reference with fewer digits than this floor is
 * too weak to contrast: it would match almost any bank movement sharing those
 * trailing digits, so suffix matching is skipped and only exact equality can
 * match.
 */
export const MIN_DIGITOS_CONTRASTE = 4;

const PESO_REFERENCIA_EXACTA = 40;
const PESO_SUFIJO = 25;
const PESO_MONTO_EXACTO = 30;
const PESO_MONTO_TOLERANCIA = 20;
const PESO_FECHA_MISMO_DIA = 20;
const PESO_FECHA_1_DIA = 15;
const PESO_FECHA_2_DIAS = 10;
const PESO_FECHA_VENTANA = 5;
const PUNTAJE_MAXIMO =
  PESO_REFERENCIA_EXACTA + PESO_MONTO_EXACTO + PESO_FECHA_MISMO_DIA;

/** Strips every non-digit from a reference (e.g. `12-34` -> `1234`). */
export function normalizarReferencia(referencia: string): string {
  return referencia.replace(/\D/g, '');
}

/**
 * Returns the reference's trailing suffix used for contrast: the last `suffix`
 * digits when the digit-normalized reference has at least that many digits,
 * otherwise the reference's own digits (digit-normalized).
 */
export function sufijoReferencia(referencia: string, suffix: number): string {
  return normalizarReferencia(referencia).slice(-suffix);
}

/** True when both references match exactly or on their trailing suffix. */
export function referenciasCoinciden(
  refA: string,
  refB: string,
  suffix: number,
): { exacta: boolean; sufijo: boolean } {
  const a = refA.trim();
  const b = refB.trim();
  if (a === b) return { exacta: true, sufijo: false };

  const sa = sufijoReferencia(a, suffix);
  const sb = sufijoReferencia(b, suffix);
  // CR-001 R1: contrast on the digit-normalized references, never on the raw
  // value. A suffix shorter than the floor is too weak to be a match signal.
  if (sa.length < MIN_DIGITOS_CONTRASTE || sb.length < MIN_DIGITOS_CONTRASTE) {
    return { exacta: false, sufijo: false };
  }

  const da = normalizarReferencia(a);
  const db = normalizarReferencia(b);
  if (db.endsWith(sa) || da.endsWith(sb) || sa === sb) {
    return { exacta: false, sufijo: true };
  }
  return { exacta: false, sufijo: false };
}

/**
 * Pure scoring function — unit tested without a database.
 * Returns `null` when the candidate does not meet the minimum criteria.
 */
export function calcularPuntaje(
  pago: PagoParaConciliar,
  mov: MovimientoCandidato,
  config: Pick<ConfigValues, 'toleranciaMontoBs' | 'ventanaDias' | 'referenciaSufijo'>,
): Coincidencia | null {
  const { exacta, sufijo } = referenciasCoinciden(
    pago.referencia,
    mov.referencia,
    config.referenciaSufijo,
  );
  if (!exacta && !sufijo) return null;

  const diferenciaMonto = pago.montoBs.minus(mov.montoBs).abs();
  const tolerancia = new Prisma.Decimal(config.toleranciaMontoBs);
  if (diferenciaMonto.gt(tolerancia)) return null;

  const diffDias = Math.abs(
    Math.round(
      (pago.fechaPago.getTime() - mov.fechaEjecucion.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  if (diffDias > config.ventanaDias) return null;

  let puntaje = 0;
  puntaje += exacta ? PESO_REFERENCIA_EXACTA : PESO_SUFIJO;
  puntaje += diferenciaMonto.eq(0) ? PESO_MONTO_EXACTO : PESO_MONTO_TOLERANCIA;
  if (diffDias === 0) puntaje += PESO_FECHA_MISMO_DIA;
  else if (diffDias === 1) puntaje += PESO_FECHA_1_DIA;
  else if (diffDias === 2) puntaje += PESO_FECHA_2_DIAS;
  else puntaje += PESO_FECHA_VENTANA;

  return {
    movimiento: mov,
    puntaje: Math.round((puntaje / PUNTAJE_MAXIMO) * 100),
    referenciaExacta: exacta,
    coincidenciaSufijo: sufijo,
    diferenciaMontoBs: diferenciaMonto.toFixed(2),
    diferenciaDias: diffDias,
  };
}

/**
 * Re-evaluates an existing payment <-> movement link after an edit, using the
 * NEW payment values. Reuses `calcularPuntaje` (no duplicated match logic) and
 * adds the reconciliation account invariant: both sides must belong to the same
 * collection account. Returns `null` when the edited payment no longer supports
 * the link, which callers treat as a blocking condition (D9).
 */
export function evaluarVinculoConciliacion(
  pago: PagoParaConciliar,
  mov: MovimientoCandidato & { cuentaRecaudadoraId: number },
  config: Pick<ConfigValues, 'toleranciaMontoBs' | 'ventanaDias' | 'referenciaSufijo'>,
): Coincidencia | null {
  if (mov.cuentaRecaudadoraId !== pago.cuentaRecaudadoraId) return null;
  return calcularPuntaje(pago, mov, config);
}

/**
 * Queries un-reconciled bank movements of the same collection account and
 * returns the scored candidates ordered by score (desc). The candidate set is
 * narrowed in SQL (account + state + amount window + date window + reference
 * OR clause) so only a small set is scored in memory.
 *
 * `db` defaults to the global client so existing callers are unaffected; pass a
 * transaction client to keep the scan inside the caller's snapshot.
 */
export async function buscarCoincidencias(
  pago: PagoParaConciliar,
  configOverride?: ConfigValues,
  db: Prisma.TransactionClient = prisma,
): Promise<Coincidencia[]> {
  const config = configOverride ?? (await getConfigValues());
  const tolerancia = new Prisma.Decimal(config.toleranciaMontoBs);
  const desde = new Date(pago.fechaPago);
  desde.setDate(desde.getDate() - config.ventanaDias);
  const hasta = new Date(pago.fechaPago);
  hasta.setDate(hasta.getDate() + config.ventanaDias + 1);

  const sufijo = sufijoReferencia(pago.referencia, config.referenciaSufijo);
  // CR-001 R1: only broaden by suffix when the contrast reaches the floor.
  // Otherwise (very short reference) only exact equality can match.
  const referenciaOr: Prisma.MovimientoBancoWhereInput[] = [{ referencia: pago.referencia }];
  if (sufijo.length >= MIN_DIGITOS_CONTRASTE) {
    referenciaOr.push({ referencia: { endsWith: sufijo } });
  }

  const movimientos = await db.movimientoBanco.findMany({
    where: {
      cuentaRecaudadoraId: pago.cuentaRecaudadoraId,
      estadoConciliacion: 'no_conciliado',
      pago: null, // not already linked to a reported payment
      montoBs: {
        gte: pago.montoBs.minus(tolerancia),
        lte: pago.montoBs.plus(tolerancia),
      },
      fechaEjecucion: { gte: desde, lt: hasta },
      OR: referenciaOr,
    },
    select: { id: true, referencia: true, montoBs: true, fechaEjecucion: true },
    take: 50,
  });

  const coincidencias = movimientos
    .map((m) => calcularPuntaje(pago, m, config))
    .filter((c): c is Coincidencia => c !== null)
    .sort((a, b) => b.puntaje - a.puntaje);

  return coincidencias;
}

/** Minimal payment data needed to look for an already-reconciled duplicate. */
export interface PagoParaDuplicado {
  referencia: string;
  montoBs: Prisma.Decimal;
  cuentaRecaudadoraId: number;
}

/** An already-reconciled movement and the payment it is reconciled with. */
export interface Duplicado {
  movimientoBancoId: number;
  referencia: string;
  montoBs: string;
  pagoReportadoId: number;
}

/**
 * Reference + amount conjunction WITHOUT the date window. Used by duplicate
 * detection (CR-001 R3 / R2): the contrast is exact-or-suffix reference AND
 * amount in Bs within tolerance.
 */
export function coincideReferenciaMonto(
  pago: PagoParaDuplicado,
  mov: MovimientoCandidato,
  config: Pick<ConfigValues, 'toleranciaMontoBs' | 'referenciaSufijo'>,
): boolean {
  const { exacta, sufijo } = referenciasCoinciden(
    pago.referencia,
    mov.referencia,
    config.referenciaSufijo,
  );
  if (!exacta && !sufijo) return false;

  const diferencia = pago.montoBs.minus(mov.montoBs).abs();
  return diferencia.lte(new Prisma.Decimal(config.toleranciaMontoBs));
}

/**
 * Finds an already-reconciled bank movement that matches the reported payment
 * by reference contrast + amount in Bs, inside the SAME collection account
 * (CR-001 R3 / D1). Returns the movement and the payment it is already
 * reconciled with, or `null` when the payment is clean.
 *
 * The date window is DELIBERATELY excluded. A duplicate report usually carries
 * a wrong date; that wrong date is precisely how the duplicate arises. Applying
 * the window here would hide the duplicate instead of flagging it, so this
 * search intentionally looks beyond the matching date range.
 */
export async function buscarDuplicado(
  pago: PagoParaDuplicado,
  configOverride?: ConfigValues,
  db: Prisma.TransactionClient = prisma,
): Promise<Duplicado | null> {
  const config = configOverride ?? (await getConfigValues());
  const tolerancia = new Prisma.Decimal(config.toleranciaMontoBs);

  // Narrow in SQL by account + amount window + already-reconciled state; the
  // reference contrast is resolved in memory so digit normalization and the
  // 4-digit floor stay identical to the pure matcher.
  const movimientos = await db.movimientoBanco.findMany({
    where: {
      cuentaRecaudadoraId: pago.cuentaRecaudadoraId,
      montoBs: {
        gte: pago.montoBs.minus(tolerancia),
        lte: pago.montoBs.plus(tolerancia),
      },
      OR: [{ estadoConciliacion: 'conciliado' }, { pago: { isNot: null } }],
    },
    select: {
      id: true,
      referencia: true,
      montoBs: true,
      fechaEjecucion: true,
      pago: { select: { id: true } },
    },
    orderBy: { id: 'asc' },
    take: 50,
  });

  const match = movimientos.find(
    (m) => m.pago !== null && coincideReferenciaMonto(pago, m, config),
  );
  if (!match || !match.pago) return null;

  return {
    movimientoBancoId: match.id,
    referencia: match.referencia,
    montoBs: match.montoBs.toString(),
    pagoReportadoId: match.pago.id,
  };
}
