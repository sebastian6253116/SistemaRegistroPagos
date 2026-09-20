import type { NextFunction, Request, Response } from 'express';

/** Application-level error with an HTTP status code and optional details. */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, 'bad_request', details);
  }
  static unauthorized(message = 'No autenticado') {
    return new ApiError(401, message, 'unauthorized');
  }
  static forbidden(message = 'No tiene permisos para esta accion') {
    return new ApiError(403, message, 'forbidden');
  }
  static notFound(message = 'Recurso no encontrado') {
    return new ApiError(404, message, 'not_found');
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError(409, message, 'conflict', details);
  }
  static tooMany(message = 'Demasiados intentos') {
    return new ApiError(429, message, 'too_many_requests');
  }
}

/** Wraps an async route handler so thrown errors reach the error middleware. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Parses page/pageSize from a query object with sane bounds. */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const page = Math.max(1, Number(query.page) || 1);
  const rawSize = Number(query.pageSize) || 20;
  const pageSize = Math.min(200, Math.max(1, rawSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate<T>(data: T[], total: number, params: PaginationParams): Paginated<T> {
  return {
    data,
    meta: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    },
  };
}
