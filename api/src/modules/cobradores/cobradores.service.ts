import { Prisma } from '@prisma/client';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar, snapshot } from '../../lib/audit';
import type { Actor } from '../usuarios/usuarios.service';
import type {
  CreateCobradorInput,
  ListCobradoresQuery,
  UpdateCobradorInput,
} from './cobradores.schema';

const cobradorSelect = {
  id: true,
  nombre: true,
  codigo: true,
  usuarioId: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  usuario: { select: { id: true, usuario: true } },
} satisfies Prisma.CobradorSelect;

type CobradorPayload = Prisma.CobradorGetPayload<{ select: typeof cobradorSelect }>;

async function assertUsuarioDisponible(
  usuarioId: number | null | undefined,
  selfId?: number,
): Promise<void> {
  if (usuarioId === null || usuarioId === undefined) return;

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw ApiError.badRequest('El usuario indicado no existe');

  const vinculado = await prisma.cobrador.findFirst({
    where: { usuarioId, ...(selfId !== undefined ? { NOT: { id: selfId } } : {}) },
  });
  if (vinculado) throw ApiError.conflict('El usuario ya esta vinculado a otro cobrador');
}

export async function list(input: ListCobradoresQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.CobradorWhereInput = {};

  if (input.search) {
    where.OR = [
      { nombre: { contains: input.search } },
      { codigo: { contains: input.search } },
    ];
  }
  if (input.activo !== undefined) where.activo = input.activo;

  const [data, total] = await Promise.all([
    prisma.cobrador.findMany({
      where,
      select: cobradorSelect,
      orderBy: { nombre: 'asc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.cobrador.count({ where }),
  ]);

  return paginate<CobradorPayload>(data, total, params);
}

export async function getById(id: number): Promise<CobradorPayload> {
  const row = await prisma.cobrador.findUnique({ where: { id }, select: cobradorSelect });
  if (!row) throw ApiError.notFound('Cobrador no encontrado');
  return row;
}

export async function create(input: CreateCobradorInput, actor: Actor): Promise<CobradorPayload> {
  const duplicado = await prisma.cobrador.findUnique({ where: { codigo: input.codigo } });
  if (duplicado) throw ApiError.conflict('El codigo de cobrador ya esta en uso');

  await assertUsuarioDisponible(input.usuarioId);

  const created = await prisma.cobrador.create({
    data: {
      nombre: input.nombre,
      codigo: input.codigo,
      usuarioId: input.usuarioId ?? null,
      activo: input.activo ?? true,
    },
    select: cobradorSelect,
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'cobradores',
    entidadId: created.id,
    accion: 'crear',
    datosDespues: snapshot(created),
    ip: actor.ip,
  });

  return created;
}

export async function update(
  id: number,
  input: UpdateCobradorInput,
  actor: Actor,
): Promise<CobradorPayload> {
  const before = await prisma.cobrador.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Cobrador no encontrado');

  if (input.codigo !== undefined && input.codigo !== before.codigo) {
    const duplicado = await prisma.cobrador.findUnique({ where: { codigo: input.codigo } });
    if (duplicado) throw ApiError.conflict('El codigo de cobrador ya esta en uso');
  }

  if (input.usuarioId !== undefined) {
    await assertUsuarioDisponible(input.usuarioId, id);
  }

  const data: Prisma.CobradorUncheckedUpdateInput = {};
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.codigo !== undefined) data.codigo = input.codigo;
  if (input.usuarioId !== undefined) data.usuarioId = input.usuarioId;
  if (input.activo !== undefined) data.activo = input.activo;

  const after = await prisma.cobrador.update({ where: { id }, data, select: cobradorSelect });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'cobradores',
    entidadId: id,
    accion: 'editar',
    datosAntes: snapshot(before),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });

  return after;
}

/** Soft delete: the collector is deactivated, never removed from the database. */
export async function remove(id: number, actor: Actor): Promise<void> {
  const before = await prisma.cobrador.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Cobrador no encontrado');

  const after = await prisma.cobrador.update({
    where: { id },
    data: { activo: false },
    select: cobradorSelect,
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'cobradores',
    entidadId: id,
    accion: 'borrar',
    datosAntes: snapshot(before),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });
}
