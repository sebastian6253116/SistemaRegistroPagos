/**
 * User ↔ collector synchronisation.
 *
 * In this system a collector is NOT the same thing as a user: `cobradores` is a
 * catalog table (with its own `codigo`) that can optionally be linked to a user.
 * Reports are always attached to a `cobradores` row, so the "Cobrador (reportar
 * a nombre de)" selector can only offer rows that actually exist.
 *
 * The business, however, thinks of a collector as "an active user with the
 * `Cobrador` role": that is how the collector is created, renamed and enabled
 * from Configuracion → Usuarios. That mismatch meant enabling a collector user
 * produced no selectable collector at all.
 *
 * This module closes the gap. It keeps the catalog in sync with the role:
 *
 *   - a user with the `Cobrador` role always has a linked collector row;
 *   - the collector mirrors the user's full name and active flag;
 *   - when the user stops being a collector (role change, deactivation or soft
 *     delete) the collector is deactivated, never deleted, so the payments
 *     already reported keep their reference.
 *
 * `repararCobradoresFaltantes()` repairs data created before this module
 * existed. It is strictly additive: it only provisions missing rows and never
 * touches a collector that already exists.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/** Either the shared client or a transaction client, as in `pagos.service`. */
type Db = Prisma.TransactionClient;

/** Role that makes a user a collector. Must match the role created by prisma/seed.ts. */
export const ROL_COBRADOR = 'Cobrador';

/** Maximum length of `cobradores.codigo` (see prisma/schema.prisma). */
export const CODIGO_MAX_LENGTH = 40;

/** Upper bound for the uniqueness suffix search, so the loop can never hang. */
const CODIGO_MAX_INTENTOS = 100;

/**
 * Derives a stable, database-safe collector code from a login name.
 *
 * Pure on purpose: the suffix that guarantees uniqueness is resolved separately
 * against the database, which keeps this mapping unit-testable.
 */
export function codigoBaseDesdeUsuario(usuario: string): string {
  const limpio = usuario
    .normalize('NFD')
    // Drop the diacritics Spanish names carry, so "José" becomes "JOSE"
    // instead of losing the vowel to the separator below.
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return (limpio || 'COBRADOR').slice(0, CODIGO_MAX_LENGTH);
}

/** Appends `-2`, `-3`… until the code is free (or owned by `excludeId`). */
async function codigoDisponible(
  base: string,
  db: Db,
  excludeId?: number,
): Promise<string> {
  for (let intento = 0; intento < CODIGO_MAX_INTENTOS; intento += 1) {
    const marca = intento === 0 ? '' : `-${intento + 1}`;
    const candidato = `${base.slice(0, CODIGO_MAX_LENGTH - marca.length)}${marca}`;
    const existente = await db.cobrador.findUnique({
      where: { codigo: candidato },
      select: { id: true },
    });
    if (!existente || existente.id === excludeId) return candidato;
  }

  throw new Error(`No se pudo generar un codigo de cobrador unico para "${base}"`);
}

/**
 * Full sync for a single user. Safe to call after any user write: it reads the
 * user back, so it always works from the persisted state.
 */
export async function provisionarCobradorDeUsuario(
  usuarioId: number,
  db: Db = prisma,
): Promise<void> {
  const usuario = await db.usuario.findUnique({
    where: { id: usuarioId },
    include: { rol: { select: { nombre: true } } },
  });
  if (!usuario) return;

  const vinculado = await db.cobrador.findUnique({ where: { usuarioId } });

  if (usuario.rol.nombre !== ROL_COBRADOR) {
    // No longer a collector: hide it instead of deleting it. Payments already
    // reported against this collector must keep a valid reference.
    if (vinculado?.activo) {
      await db.cobrador.update({ where: { id: vinculado.id }, data: { activo: false } });
    }
    return;
  }

  if (!vinculado) {
    const codigo = await codigoDisponible(codigoBaseDesdeUsuario(usuario.usuario), db);
    await db.cobrador.create({
      data: {
        nombre: usuario.nombreCompleto,
        codigo,
        usuarioId: usuario.id,
        activo: usuario.activo,
      },
    });
    return;
  }

  if (vinculado.nombre !== usuario.nombreCompleto || vinculado.activo !== usuario.activo) {
    await db.cobrador.update({
      where: { id: vinculado.id },
      data: { nombre: usuario.nombreCompleto, activo: usuario.activo },
    });
  }
}

/**
 * Best-effort wrapper for request handlers: a collector-provisioning failure
 * must never fail the user write itself. Anything missed here is repaired by
 * `repararCobradoresFaltantes()` on the next boot.
 */
export async function provisionarCobradorDeUsuarioSeguro(usuarioId: number): Promise<void> {
  try {
    await provisionarCobradorDeUsuario(usuarioId);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[cobradores] no se pudo sincronizar el cobrador del usuario ${usuarioId}:`,
      error,
    );
  }
}

/**
 * Startup repair: provisions the collector row that every `Cobrador`-role user
 * should have. Strictly additive — existing collectors are left untouched.
 * Returns how many rows it created.
 */
export async function repararCobradoresFaltantes(db: Db = prisma): Promise<number> {
  const rol = await db.rol.findUnique({
    where: { nombre: ROL_COBRADOR },
    select: { id: true },
  });
  if (!rol) return 0;

  const usuarios = await db.usuario.findMany({
    where: { rolId: rol.id, cobrador: { is: null } },
    select: { id: true, nombreCompleto: true, usuario: true, activo: true },
  });

  for (const usuario of usuarios) {
    const codigo = await codigoDisponible(codigoBaseDesdeUsuario(usuario.usuario), db);
    await db.cobrador.create({
      data: {
        nombre: usuario.nombreCompleto,
        codigo,
        usuarioId: usuario.id,
        activo: usuario.activo,
      },
    });
  }

  return usuarios.length;
}
