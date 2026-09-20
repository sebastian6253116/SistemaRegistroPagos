import { Prisma } from '@prisma/client';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar, snapshot } from '../../lib/audit';
import { invalidateConfigCache } from '../../lib/config-values';
import type { Actor } from '../usuarios/usuarios.service';
import type {
  CreateTipoPagoInput,
  ListTiposPagoQuery,
  UpdateTipoPagoInput,
} from './tipos-pago.schema';

const TIPO_PAGO_DEFAULT_CLAVE = 'pago.tipo_pago_default';

const tipoPagoSelect = {
  id: true,
  nombre: true,
  descripcion: true,
  activo: true,
  orden: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TipoPagoSelect;

type TipoPagoPayload = Prisma.TipoPagoGetPayload<{ select: typeof tipoPagoSelect }>;

export async function list(input: ListTiposPagoQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.TipoPagoWhereInput = {};

  if (input.search) {
    where.OR = [
      { nombre: { contains: input.search } },
      { descripcion: { contains: input.search } },
    ];
  }
  if (input.activo !== undefined) where.activo = input.activo;

  const [data, total] = await Promise.all([
    prisma.tipoPago.findMany({
      where,
      select: tipoPagoSelect,
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      skip: params.skip,
      take: params.take,
    }),
    prisma.tipoPago.count({ where }),
  ]);

  return paginate<TipoPagoPayload>(data, total, params);
}

export async function getById(id: number): Promise<TipoPagoPayload> {
  const row = await prisma.tipoPago.findUnique({ where: { id }, select: tipoPagoSelect });
  if (!row) throw ApiError.notFound('Tipo de pago no encontrado');
  return row;
}

/**
 * Creates a payment type. A duplicate `nombre` is rejected by the unique index
 * and mapped to HTTP 409 by the central error handler (P2002), so there is no
 * extra pre-check here.
 */
export async function create(
  input: CreateTipoPagoInput,
  actor: Actor,
): Promise<TipoPagoPayload> {
  const created = await prisma.tipoPago.create({
    data: {
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
      activo: input.activo ?? true,
      orden: input.orden ?? 0,
    },
    select: tipoPagoSelect,
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'tipos_pago',
    entidadId: created.id,
    accion: 'crear',
    datosDespues: snapshot(created),
    ip: actor.ip,
  });

  return created;
}

export async function update(
  id: number,
  input: UpdateTipoPagoInput,
  actor: Actor,
): Promise<TipoPagoPayload> {
  const before = await prisma.tipoPago.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Tipo de pago no encontrado');

  const data: Prisma.TipoPagoUpdateInput = {};
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.descripcion !== undefined) data.descripcion = input.descripcion;
  if (input.activo !== undefined) data.activo = input.activo;
  if (input.orden !== undefined) data.orden = input.orden;

  const after = await prisma.tipoPago.update({ where: { id }, data, select: tipoPagoSelect });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'tipos_pago',
    entidadId: id,
    accion: 'editar',
    datosAntes: snapshot(before),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });

  return after;
}

/** Soft delete: payments reference this table, so the type is only deactivated. */
export async function remove(id: number, actor: Actor): Promise<void> {
  const before = await prisma.tipoPago.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Tipo de pago no encontrado');

  const after = await prisma.tipoPago.update({
    where: { id },
    data: { activo: false },
    select: tipoPagoSelect,
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'tipos_pago',
    entidadId: id,
    accion: 'borrar',
    datosAntes: snapshot(before),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });
}

/** Marks an active type as the default and refreshes the config cache. */
export async function setDefault(id: number, actor: Actor): Promise<TipoPagoPayload> {
  const tipo = await prisma.tipoPago.findUnique({ where: { id }, select: tipoPagoSelect });
  if (!tipo) throw ApiError.notFound('Tipo de pago no encontrado');
  if (!tipo.activo) {
    throw ApiError.badRequest('No se puede marcar como predeterminado un tipo de pago inactivo');
  }

  await prisma.parametro.upsert({
    where: { clave: TIPO_PAGO_DEFAULT_CLAVE },
    update: { valor: String(id) },
    create: {
      clave: TIPO_PAGO_DEFAULT_CLAVE,
      valor: String(id),
      descripcion: 'Tipo de pago por defecto para registrar pagos',
    },
  });

  invalidateConfigCache();

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'tipos_pago',
    entidadId: id,
    accion: 'editar',
    datosDespues: snapshot(tipo),
    ip: actor.ip,
  });

  return tipo;
}
