import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './dashboard.controller';
import {
  nuevoViejoQuerySchema,
  resumenQuerySchema,
  serieQuerySchema,
} from './dashboard.schema';

const router = Router();

router.use(authenticate);
router.use(requirePermiso('dashboard.ver'));

router.get('/resumen', validate({ query: resumenQuerySchema }), controller.resumen);
router.get('/serie', validate({ query: serieQuerySchema }), controller.serie);
router.get('/nuevo-viejo', validate({ query: nuevoViejoQuerySchema }), controller.nuevoViejo);

export default router;
