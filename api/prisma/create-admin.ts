/**
 * Production admin bootstrap.
 *
 * Creates or updates a single `Administrador` user from environment variables.
 * It never uses a hard-coded password: the operator must supply ADMIN_PASSWORD.
 *
 * Usage (development, with tsx):
 *   ADMIN_USERNAME=admin \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_PASSWORD='<strong-secret>' \
 *   npm run create-admin
 *
 * Usage (inside the production image, where only compiled JS is available):
 *   node dist/prisma/create-admin.js
 *
 * All credential validation runs BEFORE the Prisma client is created, so a
 * weak or missing password fails fast and never touches the database.
 */
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_ROLE_NAME,
  assertStrongAdminPassword,
  hashPassword,
  resolveAdministradorRolId,
} from './admin-shared';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim() || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() || '';
const ADMIN_NOMBRE_COMPLETO =
  process.env.ADMIN_NOMBRE_COMPLETO?.trim() || 'Administrador del Sistema';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;

  // 1. Validate credentials first: no database client is created below this
  //    point unless every check passes.
  assertStrongAdminPassword(password);

  if (!ADMIN_EMAIL) {
    throw new Error('ADMIN_EMAIL es obligatorio.');
  }
  if (!EMAIL_PATTERN.test(ADMIN_EMAIL)) {
    throw new Error('ADMIN_EMAIL no es una direccion de correo valida.');
  }
  if (password.toLowerCase().includes(ADMIN_USERNAME.toLowerCase())) {
    throw new Error('ADMIN_PASSWORD no debe contener el nombre de usuario.');
  }

  // 2. Only now open a database connection.
  const prisma = new PrismaClient();
  try {
    const rolId = await resolveAdministradorRolId(prisma);
    const passwordHash = await hashPassword(password);

    const usuario = await prisma.usuario.upsert({
      where: { usuario: ADMIN_USERNAME },
      update: {
        email: ADMIN_EMAIL,
        nombreCompleto: ADMIN_NOMBRE_COMPLETO,
        rolId,
        passwordHash,
        activo: true,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      },
      create: {
        usuario: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        nombreCompleto: ADMIN_NOMBRE_COMPLETO,
        passwordHash,
        rolId,
        activo: true,
      },
    });

    console.log(
      `Administrador "${usuario.usuario}" creado/actualizado con rol "${ADMIN_ROLE_NAME}".`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`No se pudo crear el administrador: ${message}`);
  process.exit(1);
});
