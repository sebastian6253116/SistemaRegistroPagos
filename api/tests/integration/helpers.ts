/**
 * Shared fixtures and HTTP helpers for the integration suite.
 *
 * Rows are created directly with Prisma so each test controls the exact state
 * (a validated payment with its movement + reconciliation, a duplicate pair,
 * etc.). Everything funnels through the real HTTP stack via `createApp()`.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/middleware/auth';
import { calcularTasa } from '../../src/lib/money';

/** The real Express app, wired exactly like `src/index.ts`. */
export const app = createApp();

/** Signs a real access token for a SEEDED user (no hardcoded tokens). */
export async function tokenPara(usuario: string): Promise<string> {
  const user = await prisma.usuario.findUniqueOrThrow({
    where: { usuario },
    include: { rol: true },
  });
  return signAccessToken({ sub: user.id, usuario: user.usuario, rol: user.rol.nombre });
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export interface SeedRefs {
  cuentaRecaudadoraId: number;
  bancoOrigenId: number;
  tipoPagoId: number;
  cobrador1Id: number;
  cobrador2Id: number;
  cobrador1UserId: number;
  adminId: number;
  administrativoId: number;
}

/** Resolves the baseline catalog/role references created by prisma/seed.ts. */
export async function seedRefs(): Promise<SeedRefs> {
  const [cuenta, banco, tipo, cob1, cob2, admin, administrativo] = await Promise.all([
    prisma.cuentaRecaudadora.findFirstOrThrow({
      where: { activo: true },
      orderBy: { id: 'asc' },
    }),
    prisma.banco.findFirstOrThrow({ where: { codigo: '0172' } }),
    prisma.tipoPago.findFirstOrThrow({ where: { nombre: 'Pago Móvil' } }),
    prisma.cobrador.findUniqueOrThrow({
      where: { codigo: 'COB-001' },
      include: { usuario: true },
    }),
    prisma.cobrador.findUniqueOrThrow({ where: { codigo: 'COB-002' } }),
    prisma.usuario.findUniqueOrThrow({ where: { usuario: 'admin' } }),
    prisma.usuario.findUniqueOrThrow({ where: { usuario: 'administrativo' } }),
  ]);

  if (cob1.usuarioId == null) {
    throw new Error('Seed invariant broken: COB-001 is not linked to a user');
  }

  return {
    cuentaRecaudadoraId: cuenta.id,
    bancoOrigenId: banco.id,
    tipoPagoId: tipo.id,
    cobrador1Id: cob1.id,
    cobrador2Id: cob2.id,
    cobrador1UserId: cob1.usuarioId,
    adminId: admin.id,
    administrativoId: administrativo.id,
  };
}

/** Today at UTC midnight (the schema stores @db.Date business dates). */
export function fechaHoy(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

let contador = 0;
/** Unique-enough reference so tests never collide on the movement unique key. */
export function refUnica(prefix = 'REF'): string {
  contador += 1;
  return `${prefix}-${Date.now()}-${contador}`;
}

export async function crearMovimiento(opts: {
  cuentaRecaudadoraId: number;
  referencia: string;
  montoBs: string | number;
  fecha?: Date;
  estado?: 'no_conciliado' | 'conciliado';
}) {
  return prisma.movimientoBanco.create({
    data: {
      cuentaRecaudadoraId: opts.cuentaRecaudadoraId,
      referencia: opts.referencia,
      montoBs: new Prisma.Decimal(opts.montoBs),
      fechaEjecucion: opts.fecha ?? fechaHoy(),
      estadoConciliacion: opts.estado ?? 'no_conciliado',
    },
  });
}

export interface CrearPagoOpts {
  cobradorId: number;
  cuentaRecaudadoraId: number;
  bancoOrigenId: number;
  tipoPagoId?: number;
  referencia: string;
  montoBs: string | number;
  montoUsd?: string | number;
  fecha?: Date;
  estado?: 'pendiente' | 'validado' | 'rechazado' | 'duplicado';
  movimientoBancoId?: number;
  cliente?: string;
  motivoRechazo?: string;
}

export async function crearPago(opts: CrearPagoOpts) {
  const montoBs = new Prisma.Decimal(opts.montoBs);
  const montoUsd = new Prisma.Decimal(opts.montoUsd ?? '1.00');
  return prisma.pagoReportado.create({
    data: {
      cobradorId: opts.cobradorId,
      cuentaRecaudadoraId: opts.cuentaRecaudadoraId,
      bancoOrigenId: opts.bancoOrigenId,
      tipoPagoId: opts.tipoPagoId ?? null,
      referencia: opts.referencia,
      montoBs,
      montoUsd,
      tasa: calcularTasa(montoBs, montoUsd),
      fechaPago: opts.fecha ?? fechaHoy(),
      tipoCobro: 'nuevo',
      estado: opts.estado ?? 'pendiente',
      movimientoBancoId: opts.movimientoBancoId ?? null,
      cliente: opts.cliente ?? null,
      motivoRechazo: opts.motivoRechazo ?? null,
    },
  });
}

export interface CrearPagoValidadoOpts
  extends Omit<CrearPagoOpts, 'estado' | 'movimientoBancoId'> {
  usuarioId: number;
}

/**
 * Creates a fully consistent validated payment: a reconciled bank movement, the
 * payment linked to it and the matching `conciliaciones` row.
 */
export async function crearPagoValidado(opts: CrearPagoValidadoOpts) {
  const { usuarioId, ...pagoOpts } = opts;
  const fecha = opts.fecha ?? fechaHoy();

  const movimiento = await crearMovimiento({
    cuentaRecaudadoraId: opts.cuentaRecaudadoraId,
    referencia: opts.referencia,
    montoBs: opts.montoBs,
    fecha,
    estado: 'conciliado',
  });

  const pago = await crearPago({
    ...pagoOpts,
    fecha,
    estado: 'validado',
    movimientoBancoId: movimiento.id,
  });

  const conciliacion = await prisma.conciliacion.create({
    data: {
      pagoReportadoId: pago.id,
      movimientoBancoId: movimiento.id,
      usuarioId,
      tipo: 'manual',
      diferenciaBs: new Prisma.Decimal(opts.montoBs).minus(movimiento.montoBs),
    },
  });

  return { pago, movimiento, conciliacion };
}

/**
 * Removes every operational row created by the tests. Safe because the suite
 * runs against a disposable `<dbname>_test` database only (enforced guard).
 */
export async function limpiarDatosOperativos(): Promise<void> {
  await prisma.conciliacion.deleteMany();
  await prisma.pagoReportado.deleteMany();
  await prisma.movimientoBanco.deleteMany();
  await prisma.notificacion.deleteMany();
}

export { prisma };
