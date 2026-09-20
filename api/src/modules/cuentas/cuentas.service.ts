import { Prisma } from '@prisma/client';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar, snapshot } from '../../lib/audit';
import { invalidateConfigCache } from '../../lib/config-values';
import type { Actor } from '../usuarios/usuarios.service';
import type { CreateCuentaInput, ListCuentasQuery, UpdateCuentaInput } from './cuentas.schema';

const CUENTA_DEFAULT_CLAVE = 'pago.cuenta_recaudadora_default';

const cuentaSelect = {
  id: true,
  bancoId: true,
  numeroCuenta: true,
  alias: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  banco: { select: { id: true, nombre: true, codigo: true } },
} satisfies Prisma.CuentaRecaudadoraSelect;

type CuentaPayload = Prisma.CuentaRecaudadoraGetPayload<{ select: typeof cuentaSelect }>;

async function assertBanco(bancoId: number): Promise<void> {
  const banco = await prisma.banco.findUnique({ where: { id: bancoId } });
  if (!banco) throw ApiError.badRequest('El banco indicado no existe');
}

async function assertNumeroDisponible(
  bancoId: number,
  numeroCuenta: string,
  selfId?: number,
): Promise<void> {
  const duplicado = await prisma.cuentaRecaudadora.findFirst({
    where: { bancoId, numeroCuenta, ...(selfId !== undefined ? { NOT: { id: selfId } } : {}) },
  });
  if (duplicado) {
    throw ApiError.conflict('Ya existe una cuenta con ese numero para el banco indicado');
  }
}

export async function list(input: ListCuentasQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.CuentaRecaudadoraWhereInput = {};

  if (input.search) {
    where.OR = [
      { numeroCuenta: { contains: input.search } },
      { alias: { contains: input.search } },
    ];
  }
  if (input.bancoId !== undefined) where.bancoId = input.bancoId;
  if (input.activo !== undefined) where.activo = input.activo;

  const [data, total] = await Promise.all([
    prisma.cuentaRecaudadora.findMany({
      where,
      select: cuentaSelect,
      orderBy: { numeroCuenta: 'asc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.cuentaRecaudadora.count({ where }),
  ]);

  return paginate<CuentaPayload>(data, total, params);
}

export async function getById(id: number): Promise<CuentaPayload> {
  const row = await prisma.cuentaRecaudadora.findUnique({ where: { id }, select: cuentaSelect });
  if (!row) throw ApiError.notFound('Cuenta recaudadora no encontrada');
  return row;
}

export async function create(input: CreateCuentaInput, actor: Actor): Promise<CuentaPayload> {
  await assertBanco(input.bancoId);
  await assertNumeroDisponible(input.bancoId, input.numeroCuenta);

  const created = await prisma.cuentaRecaudadora.create({
    data: {
      bancoId: input.bancoId,
      numeroCuenta: input.numeroCuenta,
      alias: input.alias ?? null,
      activo: input.activo ?? true,
    },
    select: cuentaSelect,
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'cuentas_recaudadoras',
    entidadId: created.id,
    accion: 'crear',
    datosDespues: snapshot(created),
    ip: actor.ip,
  });

  return created;
}

export async function update(
  id: number,
  input: UpdateCuentaInput,
  actor: Actor,
): Promise<CuentaPayload> {
  const before = await prisma.cuentaRecaudadora.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Cuenta recaudadora no encontrada');

  const bancoId = input.bancoId ?? before.bancoId;
  const numeroCuenta = input.numeroCuenta ?? before.numeroCuenta;

  if (input.bancoId !== undefined) await assertBanco(input.bancoId);
  if (input.bancoId !== undefined || input.numeroCuenta !== undefined) {
    await assertNumeroDisponible(bancoId, numeroCuenta, id);
  }

  const data: Prisma.CuentaRecaudadoraUncheckedUpdateInput = {};
  if (input.bancoId !== undefined) data.bancoId = input.bancoId;
  if (input.numeroCuenta !== undefined) data.numeroCuenta = input.numeroCuenta;
  if (input.alias !== undefined) data.alias = input.alias;
  if (input.activo !== undefined) data.activo = input.activo;

  const after = await prisma.cuentaRecaudadora.update({ where: { id }, data, select: cuentaSelect });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'cuentas_recaudadoras',
    entidadId: id,
    accion: 'editar',
    datosAntes: snapshot(before),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });

  return after;
}

/** Soft delete: the account is deactivated, never removed from the database. */
export async function remove(id: number, actor: Actor): Promise<void> {
  const before = await prisma.cuentaRecaudadora.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Cuenta recaudadora no encontrada');

  const after = await prisma.cuentaRecaudadora.update({
    where: { id },
    data: { activo: false },
    select: cuentaSelect,
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'cuentas_recaudadoras',
    entidadId: id,
    accion: 'borrar',
    datosAntes: snapshot(before),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });
}

/** Marks an active account as the default and refreshes the config cache. */
export async function setDefault(id: number, actor: Actor): Promise<CuentaPayload> {
  const cuenta = await prisma.cuentaRecaudadora.findUnique({
    where: { id },
    select: cuentaSelect,
  });
  if (!cuenta) throw ApiError.notFound('Cuenta recaudadora no encontrada');
  if (!cuenta.activo) {
    throw ApiError.badRequest('No se puede marcar como predeterminada una cuenta inactiva');
  }

  await prisma.parametro.upsert({
    where: { clave: CUENTA_DEFAULT_CLAVE },
    update: { valor: String(id) },
    create: {
      clave: CUENTA_DEFAULT_CLAVE,
      valor: String(id),
      descripcion: 'Cuenta recaudadora por defecto para registrar pagos',
    },
  });

  invalidateConfigCache();

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'cuentas_recaudadoras',
    entidadId: id,
    accion: 'editar',
    datosDespues: snapshot(cuenta),
    ip: actor.ip,
  });

  return cuenta;
}
