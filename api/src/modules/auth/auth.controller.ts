import type { Request, Response } from 'express';
import { asyncHandler, ApiError } from '../../lib/http';
import * as service from './auth.service';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.login(req.body, req.ip);
  res.json(result);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.refreshTokens(req.body.refreshToken);
  res.json(result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await service.logout(req.body.refreshToken);
  res.status(204).send();
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.forgotPassword(req.body.email);
  res.json({
    message: 'Si el correo existe, se envio un enlace de recuperacion.',
    ...result,
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await service.resetPassword(req.body);
  res.json({ message: 'Contrasena restablecida correctamente.' });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await service.changePassword(req.user.id, req.body);
  res.json({ message: 'Contrasena actualizada correctamente.' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  res.json(req.user);
});
