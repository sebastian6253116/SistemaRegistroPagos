import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar, snapshot } from '../../lib/audit';
import { provisionarCobradorDeUsuarioSeguro } from '../../lib/cobrador-sync';
import type {
  CreateUsuarioInput,
  ListUsuariosQuery,
  UpdateUsuarioInput,
} from './usuarios.schema';

export interface Actor {
  usuarioId: number | null;
  ip?: string | null;
}

const usuarioSelect = {
  id: true,
  nombreCompleto: true,
  usuario: true,
  email: true,
  rolId: true,
  activo: true,
  intentosFallidos: true,
  bloqueadoHasta: true,
  ultimoAcceso: true,
  createdAt: true,
  updatedAt: true,
  rol: { select: { id: true, nombre: true } },
} satisfies Prisma.UsuarioSelect;

type UsuarioPayload = Prisma.UsuarioGetPayload<{ select: typeof usuarioSelect }>;

/** Removes the password hash before it ever reaches an audit snapshot. */
function sinPassword<T extends { passwordHash: string }>(user: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _omitido, ...rest } = user;
  return rest;
}

export async function list(input: ListUsuariosQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.UsuarioWhereInput = {};

  if (input.search) {
    where.OR = [
      { nombreCompleto: { contains: input.search } },
      { usuario: { contains: input.search } },
      { email: { contains: input.search } },
    ];
  }
  if (input.rolId !== undefined) where.rolId = input.rolId;
  if (input.activo !== undefined) where.activo = input.activo;

  const [data, total] = await Promise.all([
    prisma.usuario.findMany({
      where,
      select: usuarioSelect,
      orderBy: { nombreCompleto: 'asc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.usuario.count({ where }),
  ]);

  return paginate<UsuarioPayload>(data, total, params);
}

export async function getById(id: number): Promise<UsuarioPayload> {
  const row = await prisma.usuario.findUnique({ where: { id }, select: usuarioSelect });
  if (!row) throw ApiError.notFound('Usuario no encontrado');
  return row;
}

export async function create(
  input: CreateUsuarioInput,
  actor: Actor,
): Promise<UsuarioPayload> {
  const rol = await prisma.rol.findUnique({ where: { id: input.rolId } });
  if (!rol) throw ApiError.badRequest('El rol indicado no existe');

  const usuarioExistente = await prisma.usuario.findUnique({ where: { usuario: input.usuario } });
  if (usuarioExistente) throw ApiError.conflict('El nombre de usuario ya esta en uso');

  const emailExistente = await prisma.usuario.findUnique({ where: { email: input.email } });
  if (emailExistente) throw ApiError.conflict('El email ya esta registrado');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const created = await prisma.usuario.create({
    data: {
      nombreCompleto: input.nombreCompleto,
      usuario: input.usuario,
      email: input.email,
      passwordHash,
      rolId: input.rolId,
      activo: input.activo ?? true,
    },
    select: usuarioSelect,
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'usuarios',
    entidadId: created.id,
    accion: 'crear',
    datosDespues: snapshot(created),
    ip: actor.ip,
  });

  // A user with the `Cobrador` role must have a selectable collector row (see
  // lib/cobrador-sync.ts). Best-effort: it never fails the user write.
  await provisionarCobradorDeUsuarioSeguro(created.id);

  return created;
}

export async function update(
  id: number,
  input: UpdateUsuarioInput,
  actor: Actor,
): Promise<UsuarioPayload> {
  const before = await prisma.usuario.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Usuario no encontrado');

  if (input.rolId !== undefined) {
    const rol = await prisma.rol.findUnique({ where: { id: input.rolId } });
    if (!rol) throw ApiError.badRequest('El rol indicado no existe');
  }

  if (input.usuario !== undefined && input.usuario !== before.usuario) {
    const duplicado = await prisma.usuario.findUnique({ where: { usuario: input.usuario } });
    if (duplicado) throw ApiError.conflict('El nombre de usuario ya esta en uso');
  }

  if (input.email !== undefined && input.email !== before.email) {
    const duplicado = await prisma.usuario.findUnique({ where: { email: input.email } });
    if (duplicado) throw ApiError.conflict('El email ya esta registrado');
  }

  const data: Prisma.UsuarioUncheckedUpdateInput = {};
  if (input.nombreCompleto !== undefined) data.nombreCompleto = input.nombreCompleto;
  if (input.usuario !== undefined) data.usuario = input.usuario;
  if (input.email !== undefined) data.email = input.email;
  if (input.rolId !== undefined) data.rolId = input.rolId;
  if (input.activo !== undefined) data.activo = input.activo;
  if (input.password !== undefined) data.passwordHash = await bcrypt.hash(input.password, 10);

  const after = await prisma.usuario.update({ where: { id }, data, select: usuarioSelect });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'usuarios',
    entidadId: id,
    accion: 'editar',
    datosAntes: snapshot(sinPassword(before)),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });

  // Mirrors the collector row: created when the user becomes a collector,
  // renamed/activated with the user, deactivated when the role changes.
  await provisionarCobradorDeUsuarioSeguro(after.id);

  return after;
}

/** Soft delete: the user is deactivated, never removed from the database. */
export async function remove(id: number, actor: Actor): Promise<void> {
  const before = await prisma.usuario.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Usuario no encontrado');

  const after = await prisma.usuario.update({
    where: { id },
    data: { activo: false },
    select: usuarioSelect,
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'usuarios',
    entidadId: id,
    accion: 'borrar',
    datosAntes: snapshot(sinPassword(before)),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });

  // The linked collector follows the user: deactivated, never deleted, so the
  // payments already reported keep their reference.
  await provisionarCobradorDeUsuarioSeguro(after.id);
}
