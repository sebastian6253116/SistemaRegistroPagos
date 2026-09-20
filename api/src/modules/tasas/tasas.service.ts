import { Prisma } from '@prisma/client';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar, snapshot } from '../../lib/audit';
import type { Actor } from '../usuarios/usuarios.service';
import type { CreateTasaInput, ListTasasQuery, UpdateTasaInput } from './tasas.schema';

const tasaSelect = {
  id: true,
  fecha: true,
  valor: true,
  fuente: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TasaReferenciaSelect;

type TasaPayload = Prisma.TasaReferenciaGetPayload<{ select: typeof tasaSelect }>;

/** Decimals are serialized as strings to preserve precision in JSON. */
function serializeTasa(tasa: TasaPayload) {
  return {
    id: tasa.id,
    fecha: tasa.fecha,
    valor: tasa.valor.toString(),
    fuente: tasa.fuente,
    createdAt: tasa.createdAt,
    updatedAt: tasa.updatedAt,
  };
}

export async function list(input: ListTasasQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.TasaReferenciaWhereInput = {};

  if (input.fechaDesde || input.fechaHasta) {
    where.fecha = {};
    if (input.fechaDesde) where.fecha.gte = input.fechaDesde;
    if (input.fechaHasta) {
      where.fecha.lte = new Date(input.fechaHasta.getTime() + 86_400_000 - 1);
    }
  }

  const [rows, total] = await Promise.all([
    prisma.tasaReferencia.findMany({
      where,
      select: tasaSelect,
      orderBy: { fecha: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.tasaReferencia.count({ where }),
  ]);

  return paginate(rows.map(serializeTasa), total, params);
}

export async function getById(id: number) {
  const row = await prisma.tasaReferencia.findUnique({ where: { id }, select: tasaSelect });
  if (!row) throw ApiError.notFound('Tasa de referencia no encontrada');
  return serializeTasa(row);
}

/** Creates or replaces the rate of a given day (one rate per day, keyed by fecha). */
export async function create(input: CreateTasaInput, actor: Actor) {
  const existente = await prisma.tasaReferencia.findUnique({ where: { fecha: input.fecha } });

  const row = await prisma.tasaReferencia.upsert({
    where: { fecha: input.fecha },
    update: { valor: new Prisma.Decimal(input.valor), fuente: input.fuente ?? null },
    create: {
      fecha: input.fecha,
      valor: new Prisma.Decimal(input.valor),
      fuente: input.fuente ?? null,
    },
    select: tasaSelect,
  });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'tasas_referencia',
    entidadId: row.id,
    accion: existente ? 'editar' : 'crear',
    datosAntes: existente ? snapshot(existente) : undefined,
    datosDespues: snapshot(row),
    ip: actor.ip,
  });

  return serializeTasa(row);
}

export async function update(id: number, input: UpdateTasaInput, actor: Actor) {
  const before = await prisma.tasaReferencia.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Tasa de referencia no encontrada');

  if (input.fecha !== undefined && input.fecha.getTime() !== before.fecha.getTime()) {
    const duplicado = await prisma.tasaReferencia.findUnique({ where: { fecha: input.fecha } });
    if (duplicado) throw ApiError.conflict('Ya existe una tasa de referencia para esa fecha');
  }

  const data: Prisma.TasaReferenciaUncheckedUpdateInput = {};
  if (input.fecha !== undefined) data.fecha = input.fecha;
  if (input.valor !== undefined) data.valor = new Prisma.Decimal(input.valor);
  if (input.fuente !== undefined) data.fuente = input.fuente;

  const row = await prisma.tasaReferencia.update({ where: { id }, data, select: tasaSelect });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'tasas_referencia',
    entidadId: id,
    accion: 'editar',
    datosAntes: snapshot(before),
    datosDespues: snapshot(row),
    ip: actor.ip,
  });

  return serializeTasa(row);
}

export async function remove(id: number, actor: Actor): Promise<void> {
  const before = await prisma.tasaReferencia.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Tasa de referencia no encontrada');

  await prisma.tasaReferencia.delete({ where: { id } });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'tasas_referencia',
    entidadId: id,
    accion: 'borrar',
    datosAntes: snapshot(before),
    ip: actor.ip,
  });
}
