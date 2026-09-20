import { Prisma } from '@prisma/client';
import { ApiError, paginate, parsePagination } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar, snapshot } from '../../lib/audit';
import type { Actor } from '../usuarios/usuarios.service';
import type { CreateBancoInput, ListBancosQuery, UpdateBancoInput } from './bancos.schema';

const bancoSelect = {
  id: true,
  nombre: true,
  codigo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BancoSelect;

type BancoPayload = Prisma.BancoGetPayload<{ select: typeof bancoSelect }>;

export async function list(input: ListBancosQuery) {
  const params = parsePagination(input as unknown as Record<string, unknown>);
  const where: Prisma.BancoWhereInput = {};

  if (input.search) {
    where.OR = [
      { nombre: { contains: input.search } },
      { codigo: { contains: input.search } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.banco.findMany({
      where,
      select: bancoSelect,
      orderBy: { nombre: 'asc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.banco.count({ where }),
  ]);

  return paginate<BancoPayload>(data, total, params);
}

export async function getById(id: number): Promise<BancoPayload> {
  const row = await prisma.banco.findUnique({ where: { id }, select: bancoSelect });
  if (!row) throw ApiError.notFound('Banco no encontrado');
  return row;
}

export async function create(input: CreateBancoInput, actor: Actor): Promise<BancoPayload> {
  const duplicado = await prisma.banco.findUnique({ where: { codigo: input.codigo } });
  if (duplicado) throw ApiError.conflict('El codigo de banco ya esta en uso');

  const created = await prisma.banco.create({ data: input, select: bancoSelect });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'bancos',
    entidadId: created.id,
    accion: 'crear',
    datosDespues: snapshot(created),
    ip: actor.ip,
  });

  return created;
}

export async function update(
  id: number,
  input: UpdateBancoInput,
  actor: Actor,
): Promise<BancoPayload> {
  const before = await prisma.banco.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Banco no encontrado');

  if (input.codigo !== undefined && input.codigo !== before.codigo) {
    const duplicado = await prisma.banco.findUnique({ where: { codigo: input.codigo } });
    if (duplicado) throw ApiError.conflict('El codigo de banco ya esta en uso');
  }

  const data: Prisma.BancoUpdateInput = {};
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.codigo !== undefined) data.codigo = input.codigo;

  const after = await prisma.banco.update({ where: { id }, data, select: bancoSelect });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'bancos',
    entidadId: id,
    accion: 'editar',
    datosAntes: snapshot(before),
    datosDespues: snapshot(after),
    ip: actor.ip,
  });

  return after;
}

/** Hard delete, blocked when the bank is referenced by accounts or payments. */
export async function remove(id: number, actor: Actor): Promise<void> {
  const before = await prisma.banco.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound('Banco no encontrado');

  const [cuentas, pagos] = await Promise.all([
    prisma.cuentaRecaudadora.count({ where: { bancoId: id } }),
    prisma.pagoReportado.count({ where: { bancoOrigenId: id } }),
  ]);
  if (cuentas > 0 || pagos > 0) {
    throw ApiError.conflict('No se puede eliminar el banco porque tiene cuentas o pagos asociados');
  }

  await prisma.banco.delete({ where: { id } });

  await auditar({
    usuarioId: actor.usuarioId,
    entidad: 'bancos',
    entidadId: id,
    accion: 'borrar',
    datosAntes: snapshot(before),
    ip: actor.ip,
  });
}
