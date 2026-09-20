import fs from 'node:fs';
import path from 'node:path';
import type { AuthUser } from '../../middleware/auth';
import { ApiError } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { mimeTypeForFilename, uploadDirectory } from '../../lib/upload';

/** A file that has been resolved on disk and authorized for the caller. */
export interface ArchivoResuelto {
  absolutePath: string;
  filename: string;
  contentType: string;
}

/**
 * Resolves a caller-supplied filename to an absolute path INSIDE the upload
 * directory, or throws. Uses `path.basename` and a containment check so no
 * encoded separator, `..` segment or absolute path can escape the directory.
 */
function resolverRutaSegura(filename: string): string {
  const basename = path.basename(filename);
  const hasTraversal =
    !filename ||
    basename !== filename ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..') ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f]/.test(filename);

  if (hasTraversal) throw ApiError.badRequest('Nombre de archivo invalido');

  const dir = uploadDirectory();
  const absolute = path.resolve(dir, filename);
  const relative = path.relative(dir, absolute);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw ApiError.badRequest('Nombre de archivo invalido');
  }
  return absolute;
}

/**
 * Authorizes a payment's evidence. The caller must be able to see all payments,
 * or be a validator (validators inspect receipts), or be the payment's own
 * collector.
 */
function autorizarPago(pago: { cobradorId: number }, user: AuthUser): void {
  if (user.permisos.includes('pagos.ver_todos')) return;
  if (user.permisos.includes('pagos.validar')) return;
  if (user.cobradorId != null && user.cobradorId === pago.cobradorId) return;
  throw ApiError.forbidden('No tiene permisos para ver este archivo');
}

/** Authorizes an expense's support document: requires `gastos.ver`. */
function autorizarGasto(user: AuthUser): void {
  if (user.permisos.includes('gastos.ver')) return;
  throw ApiError.forbidden('No tiene permisos para ver este archivo');
}

/**
 * Finds the record that references `<filename>` and authorizes the caller by
 * its owning entity. Files referenced by NO record are treated as not found, so
 * orphan files are never served (and existence is not leaked).
 */
export async function resolverArchivo(
  filename: string,
  user: AuthUser,
): Promise<ArchivoResuelto> {
  const absolutePath = resolverRutaSegura(filename);
  const soporteUrl = `/uploads/${filename}`;

  const pago = await prisma.pagoReportado.findFirst({
    where: { soporteUrl },
    select: { id: true, cobradorId: true },
  });

  if (pago) {
    autorizarPago(pago, user);
  } else {
    const gasto = await prisma.gasto.findFirst({ where: { soporteUrl }, select: { id: true } });
    if (!gasto) throw ApiError.notFound('Archivo no encontrado');
    autorizarGasto(user);
  }

  // Never trust anything stored: the MIME type comes from the extension
  // whitelist, and an unknown extension is not served at all.
  const contentType = mimeTypeForFilename(filename);
  if (!contentType) throw ApiError.notFound('Archivo no encontrado');

  if (!fs.existsSync(absolutePath)) throw ApiError.notFound('Archivo no encontrado');

  return { absolutePath, filename, contentType };
}
