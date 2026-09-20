import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../lib/http';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  id: number;
  usuario: string;
  nombreCompleto: string;
  rolId: number;
  rol: string;
  permisos: string[];
  cobradorId?: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface AccessTokenPayload {
  sub: number;
  usuario: string;
  rol: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: { sub: number }): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: number } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as { sub: number };
}

/** Loads a user with its role and effective permission keys. */
export async function loadAuthUser(userId: number): Promise<AuthUser | null> {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    include: {
      rol: { include: { permisos: { include: { permiso: true } } } },
      cobrador: true,
    },
  });
  if (!user || !user.activo) return null;

  return {
    id: user.id,
    usuario: user.usuario,
    nombreCompleto: user.nombreCompleto,
    rolId: user.rolId,
    rol: user.rol.nombre,
    permisos: user.rol.permisos.map((rp) => rp.permiso.clave),
    cobradorId: user.cobrador?.id ?? null,
  };
}

/** Express middleware: requires a valid access token and an active user. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Token de acceso requerido');
    }
    const token = header.slice('Bearer '.length);
    let payload: AccessTokenPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized('Token de acceso invalido o expirado');
    }

    const user = await loadAuthUser(payload.sub);
    if (!user) throw ApiError.unauthorized('Usuario inactivo o inexistente');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
