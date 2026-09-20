import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { env } from '../../config/env';
import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { auditar } from '../../lib/audit';
import {
  loadAuthUser,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AuthUser,
} from '../../middleware/auth';
import type {
  ChangePasswordInput,
  LoginInput,
  ResetPasswordInput,
} from './auth.schema';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResult {
  user: AuthUser;
  tokens: AuthTokens;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function refreshExpiryDate(): Date {
  return dayjs().add(7, 'day').toDate();
}

async function issueTokens(user: AuthUser): Promise<AuthTokens> {
  const accessToken = signAccessToken({ sub: user.id, usuario: user.usuario, rol: user.rol });
  const refreshToken = signRefreshToken({ sub: user.id });

  await prisma.refreshToken.create({
    data: {
      usuarioId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiryDate(),
    },
  });

  return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL };
}

/**
 * Authenticates a user with username/email + password.
 * Implements failed-attempt lockout (spec section 6.1).
 */
export async function login(input: LoginInput, ip?: string): Promise<AuthResult> {
  const user = await prisma.usuario.findFirst({
    where: { OR: [{ usuario: input.usuario }, { email: input.usuario }] },
  });

  // Generic message to avoid user enumeration.
  const invalid = ApiError.unauthorized('Usuario o contrasena incorrectos');
  if (!user) throw invalid;
  if (!user.activo) throw ApiError.forbidden('El usuario esta inactivo');

  if (user.bloqueadoHasta && user.bloqueadoHasta.getTime() > Date.now()) {
    const minutos = Math.ceil((user.bloqueadoHasta.getTime() - Date.now()) / 60000);
    throw ApiError.tooMany(`Cuenta bloqueada. Intente de nuevo en ${minutos} minuto(s)`);
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    const intentos = user.intentosFallidos + 1;
    const debeBloquear = intentos >= env.MAX_LOGIN_ATTEMPTS;
    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        intentosFallidos: debeBloquear ? 0 : intentos,
        bloqueadoHasta: debeBloquear
          ? dayjs().add(env.LOGIN_LOCK_MINUTES, 'minute').toDate()
          : null,
      },
    });
    await auditar({
      usuarioId: user.id,
      entidad: 'usuarios',
      entidadId: user.id,
      accion: 'login',
      datosDespues: { resultado: 'fallido', intentos: debeBloquear ? 0 : intentos },
      ip,
    });
    if (debeBloquear) {
      throw ApiError.tooMany(
        `Demasiados intentos fallidos. Cuenta bloqueada por ${env.LOGIN_LOCK_MINUTES} minutos`,
      );
    }
    throw invalid;
  }

  await prisma.usuario.update({
    where: { id: user.id },
    data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: new Date() },
  });

  const authUser = await loadAuthUser(user.id);
  if (!authUser) throw invalid;
  const tokens = await issueTokens(authUser);

  await auditar({
    usuarioId: user.id,
    entidad: 'usuarios',
    entidadId: user.id,
    accion: 'login',
    datosDespues: { resultado: 'exitoso' },
    ip,
  });

  return { user: authUser, tokens };
}

/** Rotates a refresh token: revokes the old one and issues a new pair. */
export async function refreshTokens(refreshToken: string): Promise<AuthResult> {
  let payload: { sub: number };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Refresh token invalido o expirado');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('Refresh token revocado o expirado');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const user = await loadAuthUser(payload.sub);
  if (!user) throw ApiError.unauthorized('Usuario inactivo o inexistente');

  const tokens = await issueTokens(user);
  return { user, tokens };
}

/** Revokes a single refresh token (logout of the current session). */
export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Starts the password recovery flow.
 *
 * ASSUMPTION: there is no email service integrated in this build, so the reset
 * token is returned in the response ONLY when NODE_ENV !== 'production'.
 * In production the token would be emailed and never returned.
 */
export async function forgotPassword(email: string): Promise<{ token?: string }> {
  const user = await prisma.usuario.findUnique({ where: { email } });
  // Always resolve without revealing whether the account exists.
  if (!user || !user.activo) return {};

  const rawToken = crypto.randomBytes(32).toString('hex');
  await prisma.passwordReset.create({
    data: {
      usuarioId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: dayjs().add(1, 'hour').toDate(),
    },
  });

  await auditar({
    usuarioId: user.id,
    entidad: 'usuarios',
    entidadId: user.id,
    accion: 'editar',
    datosDespues: { accion: 'solicitud_recuperacion_password' },
  });

  return env.NODE_ENV === 'production' ? {} : { token: rawToken };
}

/** Completes the password reset with a valid, unused, non-expired token. */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const record = await prisma.passwordReset.findUnique({
    where: { tokenHash: sha256(input.token) },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest('Token de recuperacion invalido o expirado');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: record.usuarioId },
      data: { passwordHash, intentosFallidos: 0, bloqueadoHasta: null },
    }),
    prisma.passwordReset.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { usuarioId: record.usuarioId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await auditar({
    usuarioId: record.usuarioId,
    entidad: 'usuarios',
    entidadId: record.usuarioId,
    accion: 'editar',
    datosDespues: { accion: 'password_restablecido' },
  });
}

/** Changes the password of the authenticated user. */
export async function changePassword(userId: number, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.usuario.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('Usuario no encontrado');

  const ok = await bcrypt.compare(input.passwordActual, user.passwordHash);
  if (!ok) throw ApiError.badRequest('La contrasena actual es incorrecta');

  const passwordHash = await bcrypt.hash(input.passwordNueva, 10);
  await prisma.usuario.update({ where: { id: userId }, data: { passwordHash } });
  await auditar({
    usuarioId: userId,
    entidad: 'usuarios',
    entidadId: userId,
    accion: 'editar',
    datosDespues: { accion: 'password_cambiado' },
  });
}
