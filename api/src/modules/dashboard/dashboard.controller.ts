import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/http';
import * as service from './dashboard.service';
import type { NuevoViejoQuery, ResumenQuery, SerieQuery } from './dashboard.schema';

export const resumen = asyncHandler(async (req: Request, res: Response) => {
  const { fecha } = req.query as unknown as ResumenQuery;
  res.json(await service.resumen(fecha));
});

export const serie = asyncHandler(async (req: Request, res: Response) => {
  const { dias } = req.query as unknown as SerieQuery;
  res.json(await service.serie(dias));
});

export const nuevoViejo = asyncHandler(async (req: Request, res: Response) => {
  const { desde, hasta } = req.query as unknown as NuevoViejoQuery;
  res.json(await service.nuevoViejo(desde, hasta));
});
