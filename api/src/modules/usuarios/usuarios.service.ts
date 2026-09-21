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

/**
 * Hard delete: permanently removes the user (and its linked collector).
 *
 * Refused with 409 when the record has dependent business records, so the
 * operation is always all-or-nothing and never leaves partial data behind.
 * The checks and the delete share ONE transaction: a row inserted meanwhile
 * cannot slip past the counts and surface later as a raw FK error.
 */
export async function removeDefinitivo(id: number, actor: Actor): Promise<void> {
  if (id === actor.usuarioId) {
    throw ApiError.badRequest('No puede eliminar su propio usuario');
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.usuario.findUnique({
      where: { id },
      include: { cobrador: { select: { id: true } } },
    });
    if (!before) throw ApiError.notFound('Usuario no encontrado');

    const cobradorId = before.cobrador?.id ?? null;

    const [gastos, conciliaciones, lotes, pagosValidados, pagosCobrador] = await Promise.all([
      tx.gasto.count({ where: { registradoPor: id } }),
      tx.conciliacion.count({ where: { usuarioId: id } }),
      tx.loteImportacion.count({ where: { usuarioId: id } }),
      tx.pagoReportado.count({ where: { validadoPor: id } }),
      cobradorId !== null
        ? tx.pagoReportado.count({ where: { cobradorId } })
        : Promise.resolve(0),
    ]);

    const blockers: string[] = [];
    if (gastos > 0) blockers.push(`${gastos} gasto(s)`);
    if (conciliaciones > 0) blockers.push(`${conciliaciones} conciliacion(es)`);
    if (lotes > 0) blockers.push(`${lotes} lote(s) de importacion`);
    if (pagosValidados > 0) blockers.push(`${pagosValidados} pago(s) validado(s)`);
    if (pagosCobrador > 0) blockers.push(`${pagosCobrador} pago(s) del cobrador vinculado`);

    if (blockers.length > 0) {
      throw ApiError.conflict(
        `No se puede eliminar definitivamente: el usuario tiene ${blockers.join(', ')}. Desactive el usuario en su lugar.`,
      );
    }

    // FK behaviour at this point: the audit log survives (auditoria.usuario_id is
    // ON DELETE SET NULL, so its rows stay with a cleared actor), which is why it
    // is NOT a blocker. `refresh_tokens`, `password_resets` and `notificaciones`
    // are CASCADE and go away with the user. `pagos_reportados.validado_por` is
    // SET NULL and is normally unreachable because `pagosValidados` is refused
    // above, but the counts read the transaction snapshot while the delete below
    // re-checks the FK against the latest committed rows: a concurrent validation
    // can still make it reachable, and the P2003 branch turns that into a 409.
    try {
      if (cobradorId !== null) {
        await tx.cobrador.delete({ where: { id: cobradorId } });
      }
      await tx.usuario.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        // Keep the raw FK error in the log: without it the dependent table that
        // fired is invisible, and errorHandler only logs errors it does not know.
        // eslint-disable-next-line no-console
        console.error('Hard delete blocked by a foreign key:', err);
        throw ApiError.conflict(
          'No se puede eliminar definitivamente: el registro adquirió datos asociados mientras se procesaba la solicitud. Recargue e intente de nuevo.',
        );
      }
      throw err;
    }

    // Auditing inside the transaction: the deletion is irreversible and the audit
    // entry is the only surviving trace of who performed it. `auditar` rethrows
    // inside a transaction, so a failed write aborts the whole delete.
    await auditar(
      {
        usuarioId: actor.usuarioId,
        entidad: 'usuarios',
        entidadId: id,
        accion: 'borrar_definitivo',
        datosAntes: snapshot(sinPassword(before)),
        ip: actor.ip,
      },
      tx,
    );
  });
}
