import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { ApiError } from './http';

/** Hard limit for support attachments (spec 5.5 / convention "File uploads"). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Spanish message shared by every rejected upload path. */
const TIPO_NO_PERMITIDO =
  'Tipo de archivo no permitido. Use PNG, JPG, WEBP, GIF o PDF.';

/**
 * Explicit whitelist of accepted MIME types mapped to the safe extension used
 * on disk. Nothing outside this map is ever stored. In particular
 * `image/svg+xml` is rejected: SVG can carry active content and serving it from
 * the API origin would become stored content-injection.
 */
export const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

/** Reverse map used when serving a file back: extension -> MIME type. */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

/** Resolves the absolute path of the configured upload directory. */
export function uploadDirectory(): string {
  return path.resolve(process.cwd(), env.UPLOAD_DIR);
}

/** Safe MIME type derived from a filename extension, or undefined if unknown. */
export function mimeTypeForFilename(filename: string): string | undefined {
  return EXTENSION_MIME_TYPES[path.extname(filename).toLowerCase()];
}

/**
 * Accepted field names for the multipart form. The frontend only needs one of
 * them; accepting the common aliases keeps the endpoint forgiving.
 */
const SOPORTE_FIELDS: multer.Field[] = [
  { name: 'archivo', maxCount: 1 },
  { name: 'soporte', maxCount: 1 },
  { name: 'file', maxCount: 1 },
];

function isAllowed(mimetype: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MIME_EXTENSIONS, mimetype);
}

/** Base multer instance: memory storage + mime whitelist + 5MB limit. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isAllowed(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(ApiError.badRequest(TIPO_NO_PERMITIDO));
  },
});

/**
 * Express middleware for the support upload. Wraps multer so its own errors
 * (size, unexpected field) become Spanish ApiError responses instead of 500s.
 */
export function soporteUpload() {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.fields(SOPORTE_FIELDS)(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(ApiError.badRequest('El archivo supera el tamano maximo de 5MB.'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(ApiError.badRequest('Campo de archivo no esperado en el formulario.'));
        }
        return next(ApiError.badRequest(`No se pudo procesar el archivo: ${err.message}`));
      }
      return next(err);
    });
  };
}

/** Extracts the first uploaded file from any of the accepted field names. */
export function primerArchivo(req: Request): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  if (files) {
    for (const list of Object.values(files)) {
      if (list && list.length > 0) return list[0];
    }
  }
  return req.file ?? undefined;
}

/**
 * Normalizes an original filename into a safe, accent-free slug. The extension
 * is NEVER taken from the user-supplied name: it is derived from the already
 * validated MIME type so a crafted filename cannot smuggle active content.
 */
function nombreSeguro(original: string, mimetype: string): string {
  const ext = ALLOWED_MIME_EXTENSIONS[mimetype];
  if (!ext) throw ApiError.badRequest(TIPO_NO_PERMITIDO);
  const base = path
    .basename(original, path.extname(original))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'archivo'}${ext}`;
}

/**
 * Persists an uploaded buffer under UPLOAD_DIR and returns its public URL.
 * Filename format: `<timestamp>-<safe-name>`.
 */
export function guardarArchivo(file: Express.Multer.File): string {
  const dir = uploadDirectory();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${nombreSeguro(file.originalname, file.mimetype)}`;
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return `/uploads/${filename}`;
}
