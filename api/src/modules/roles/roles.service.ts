import { Prisma } from '@prisma/client';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar, snapshot } from '../../lib/audit';
import type { Actor } from '../usuarios/usuarios.service';
import type { CreateRolInput, ListRolesQuery, UpdateRolInput } from './roles.schema';

const rolSelect = {
  id: true,
  nombre: true,
  descripcion: true,
  createdAt: true,
  updatedAt: true,
  permisos: { select: { permiso: { select: { clave: true, descripcion: true } } } },
  _count: { select: { usuarios: true } },
} satisfies Prisma.RolSelect;

type RolPayload = Prisma.RolGetPayload<{ select: typeof rolSelect }>;

function mapRol(rol: RolPayload) {
  return {
    id: rol.id,
    nombre: rol.nombre,
    descripcion: rol.descripcion,
    createdAt: rol.createdAt,
    updatedAt: rol.updatedAt,
    permisos: rol.permisos.map((rp) => rp.permiso.clave),
    usuarioCount: rol._count.usuarios,
  };
}

function clavesUnicas(claves: string[]): string[] {
  return Array.from(new Set(claves));
}

async function resolverPermisos(claves: string[]) {
  const unicas = clavesUnicas(claves);
  if (unicas.length === 0) return [];
  const encontrados = await prisma.permiso.findMany({ where: { clave: { in: unicas } } });
  if (encontrados.length !== unicas.length) {
    const existentes = new Set(encontrados.map((p) => p.clave));
    const faltantes = unicas.filter((c) => !existentes.has(c));
    throw ApiError.badRequest(`Permisos inexistentes: ${faltantes.join(', ')}`);
  }
  return encontrados;
}

export async function list(input: ListRolesQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.RolWhereInput = {};

  if (input.search) {
    where.OR = [
      { nombre: { contains: input.search } },
      { descripcion: { contains: input.search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.rol.findMany({
      where,
      select: rolSelect,
      orderBy: { nombre: 'asc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.rol.count({ where }),
  ]);

  return paginate(rows.map(mapRol), total, params);
}

export async function getById(id: number) {
  const row = await prisma.rol.findUnique({ where: { id }, select: rolSelect });
  if (!row) throw ApiError.notFound('Rol no encontrado');
  return mapRol(row);
}

/** Read-only permission catalog grouped by module prefix (segment before the dot). */
export async function listPermisosCatalog() {
  const permisos = await prisma.permiso.findMany({ orderBy: { clave: 'asc' } });
  const grupos = new Map<string, { clave: string; descripcion: string | null }[]>();

  for (const permiso of permisos) {
    const modulo = permiso.clave.split('.')[0] ?? permiso.clave;
    const items = grupos.get(modulo) ?? [];
    items.push({ clave: permiso.clave, descripcion: permiso.descripcion });
    grupos.set(modulo, items);
  }

  return {
    data: Array.from(grupos, ([modulo, items]) => ({ modulo, permisos: items })),
  };
}

export async function create(input: CreateRolInput, actor: Actor) {
  const duplicado = await prisma.rol.findUnique({ where: { nombre: input.nombre } });
  if (duplicado) throw ApiError.conflict('Ya existe un rol con ese nombre');

  const permisos = await resolverPermisos(input.permisos);

  const creado = await prisma.$transaction(async (tx) => {
    const rol = await tx.rol.create({
      data: { nombre: input.nombre, descripcion: input.descripcion ?? null },
    });
    if (permisos.length > 0) {
      await tx.rolPermiso.createMany({
        data: permisos.map((p) => ({ rolId: rol.id, permisoId: p.id })),
        skipDuplicates: true,
      });
    }
    return tx.rol.findUniqueOrThrow({ where: { id: rol.id }, select: rolSelect });
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'roles',
    entidadId: creado.id,
    accion: 'crear',
    datosDespues: snapshot(mapRol(creado)),
    ip: actor.ip,
  });

  return mapRol(creado);
}

export async function update(id: number, input: UpdateRolInput, actor: Actor) {
  const before = await prisma.rol.findUnique({ where: { id }, select: rolSelect });
  if (!before) throw ApiError.notFound('Rol no encontrado');

  if (input.nombre !== undefined && input.nombre !== before.nombre) {
    const duplicado = await prisma.rol.findUnique({ where: { nombre: input.nombre } });
    if (duplicado) throw ApiError.conflict('Ya existe un rol con ese nombre');
  }

  const permisos = input.permisos !== undefined ? await resolverPermisos(input.permisos) : null;

  const after = await prisma.$transaction(async (tx) => {
    await tx.rol.update({
      where: { id },
      data: {
        ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
        ...(input.descripcion !== undefined ? { descripcion: input.descripcion } : {}),
      },
    });

    if (input.permisos !== undefined) {
      await tx.rolPermiso.deleteMany({ where: { rolId: id } });
      if (permisos && permisos.length > 0) {
        await tx.rolPermiso.createMany({
          data: permisos.map((p) => ({ rolId: id, permisoId: p.id })),
          skipDuplicates: true,
        });
      }
    }

    return tx.rol.findUniqueOrThrow({ where: { id }, select: rolSelect });
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'roles',
    entidadId: id,
    accion: 'editar',
    datosAntes: snapshot(mapRol(before)),
    datosDespues: snapshot(mapRol(after)),
    ip: actor.ip,
  });

  return mapRol(after);
}

/** Deletes a role only when no user is assigned to it (otherwise 409). */
export async function remove(id: number, actor: Actor): Promise<void> {
  const before = await prisma.rol.findUnique({ where: { id }, select: rolSelect });
  if (!before) throw ApiError.notFound('Rol no encontrado');

  const usuarios = await prisma.usuario.count({ where: { rolId: id } });
  if (usuarios > 0) {
    throw ApiError.conflict('No se puede eliminar el rol porque tiene usuarios asignados');
  }

  await prisma.rol.delete({ where: { id } });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'roles',
    entidadId: id,
    accion: 'borrar',
    datosAntes: snapshot(mapRol(before)),
    ip: actor.ip,
  });
}
