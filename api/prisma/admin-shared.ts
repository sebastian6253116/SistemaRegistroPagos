/**
 * Shared admin-bootstrap helpers.
 *
 * This module centralizes the two pieces of logic that must stay identical
 * between `prisma/seed.ts` (development fixtures) and `prisma/create-admin.ts`
 * (production bootstrap):
 *
 *   1. how a password is hashed (bcrypt, cost 10), and
 *   2. how the `Administrador` role is resolved.
 *
 * Do not duplicate this logic anywhere else.
 */
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

/** bcrypt cost used across the project (see prisma/seed.ts). */
export const PASSWORD_HASH_ROUNDS = 10;

/** Canonical full-access role name. Must match the roles created by prisma/seed.ts. */
export const ADMIN_ROLE_NAME = 'Administrador';

/** Minimum length enforced for a production admin password. */
export const MIN_ADMIN_PASSWORD_LENGTH = 12;

/**
 * Known development/default passwords that must never reach production.
 * Kept in sync with prisma/seed.ts, README.md and docs/postman_collection.json.
 */
export const DEV_DEFAULT_PASSWORDS = [
  'Admin123!',
  'Admin12345',
  'Cobrador123!',
  'NuevaClave123',
];

/** Hashes a plaintext password with the project's standard bcrypt cost. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

/**
 * Resolves the `Administrador` role id.
 *
 * Fails loudly when the security model has not been provisioned yet, because
 * creating an admin without the role would leave the account useless.
 */
export async function resolveAdministradorRolId(prisma: PrismaClient): Promise<number> {
  const rol = await prisma.rol.findUnique({
    where: { nombre: ADMIN_ROLE_NAME },
    select: { id: true },
  });
  if (!rol) {
    throw new Error(
      `Rol "${ADMIN_ROLE_NAME}" no encontrado. Cargue primero el modelo de seguridad ` +
        `(por ejemplo con "npm run seed") sobre esta base de datos.`,
    );
  }
  return rol.id;
}

/**
 * Rejects a production admin password that is missing, too short, or a known
 * development default. Throws before any database connection is attempted.
 */
export function assertStrongAdminPassword(
  password: string | undefined,
): asserts password is string {
  if (!password || password.trim().length === 0) {
    throw new Error('ADMIN_PASSWORD es obligatorio.');
  }
  // Check known development defaults before length so the operator gets the
  // most specific reason (some defaults are shorter than the minimum anyway).
  const normalized = password.trim().toLowerCase();
  const isDevDefault =
    DEV_DEFAULT_PASSWORDS.some((known) => known.toLowerCase() === normalized) ||
    normalized.startsWith('change-me');
  if (isDevDefault) {
    throw new Error(
      'ADMIN_PASSWORD coincide con una contraseña de desarrollo conocida. Elija una distinta.',
    );
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD debe tener al menos ${MIN_ADMIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
}
