import type { Request, Response } from 'express';
import { ApiError, asyncHandler } from '../../lib/http';
import * as service from './archivos.service';

/**
 * Streams a stored support file to an authenticated, authorized caller. The
 * filename is used ONLY to look up the owning record and to locate the file on
 * disk; the response content type comes from the validated extension whitelist.
 */
export const descargar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const filename = String(req.params.filename ?? '');
  const archivo = await service.resolverArchivo(filename, req.user);

  const safeName = archivo.filename.replace(/[^A-Za-z0-9._-]/g, '_');

  res.setHeader('Content-Type', archivo.contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, no-store');

  res.sendFile(archivo.absolutePath);
});
