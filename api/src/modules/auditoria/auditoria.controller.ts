import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/http';
import * as service from './auditoria.service';
import type { ListAuditoriaQuery } from './auditoria.schema';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAuditoriaQuery;
  res.json(await service.list(query));
});
