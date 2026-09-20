import { Prisma } from '@prisma/client';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar, snapshot } from '../../lib/audit';
import { invalidateConfigCache } from '../../lib/config-values';
import type { Actor } from '../usuarios/usuarios.service';
import type {
  BulkParametrosInput,
  ListParametrosQuery,
  UpdateParametroInput,
} from './parametros.schema';

export async function list(input: ListParametrosQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.ParametroWhereInput = {};

  if (input.search) {
    where.OR = [
      { clave: { contains: input.search } },
      { descripcion: { contains: input.search } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.parametro.findMany({
      where,
      orderBy: { clave: 'asc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.parametro.count({ where }),
  ]);

  return paginate(data, total, params);
}

export async function update(
  clave: string,
  input: UpdateParametroInput,
  actor: Actor,
) {
  const before = await prisma.parametro.findUnique({ where: { clave } });
  if (!before) throw ApiError.notFound('Parametro no encontrado');

  const after = await prisma.parametro.update({
    where: { clave },
    data: {
      valor: input.valor,
      ...(input.descripcion !== undefined ? { descripcion: input.descripcion } : {}),
    },
  });

  invalidateConfigCache();

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'parametros',
    entidadId: after.id,
    accion: 'editar',
    datosAntes: snapshot(before),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });

  return after;
}

/** Updates several parameters at once inside a single transaction. */
export async function bulkUpdate(items: BulkParametrosInput['parametros'], actor: Actor) {
  const claves = items.map((item) => item.clave);
  const existentes = await prisma.parametro.findMany({ where: { clave: { in: claves } } });

  if (existentes.length !== new Set(claves).size) {
    const encontradas = new Set(existentes.map((p) => p.clave));
    const faltantes = Array.from(new Set(claves)).filter((c) => !encontradas.has(c));
    throw ApiError.badRequest(`Parametros inexistentes: ${faltantes.join(', ')}`);
  }

  const updates = items.map((item) =>
    prisma.parametro.update({ where: { clave: item.clave }, data: { valor: item.valor } }),
  );
  await prisma.$transaction(updates);

  invalidateConfigCache();

  const actualizados = await prisma.parametro.findMany({
    where: { clave: { in: claves } },
    orderBy: { clave: 'asc' },
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'parametros',
    entidadId: null,
    accion: 'editar',
    datosAntes: snapshot(existentes),
    datosDespues: snapshot(actualizados),
    ip: actor.ip,
  });

  return { data: actualizados };
}
