import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/http';

/**
 * Granular permission guard. Every route declares the permission key it needs.
 * The keys come from the `permisos` catalog and are resolved through
 * `rol_permisos` when the user session is loaded (see middleware/auth.ts).
 *
 * `requirePermiso('a')` requires ALL provided keys.
 * `requirePermiso.some('a','b')` requires ANY of them.
 */
export function requirePermiso(...claves: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    const faltantes = claves.filter((c) => !req.user!.permisos.includes(c));
    if (faltantes.length > 0) {
      return next(
        ApiError.forbidden(`Permisos insuficientes: ${faltantes.join(', ')}`),
      );
    }
    next();
  };
}

requirePermiso.some = (...claves: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    const ok = claves.some((c) => req.user!.permisos.includes(c));
    if (!ok) {
      return next(ApiError.forbidden(`Requiere alguno de: ${claves.join(', ')}`));
    }
    next();
  };
};
