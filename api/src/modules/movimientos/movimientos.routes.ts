import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './movimientos.controller';
import { idParamSchema, listarMovimientosSchema } from './movimientos.schema';

const router = Router();

// Only authentication is global. Each route declares its own permission so a
// user holding only one of `movimientos.*` is governed by exactly that key: a
// global `movimientos.ver` guard would wrongly block a delete-only user.
router.use(authenticate);

router.get(
  '/',
  requirePermiso('movimientos.ver'),
  validate({ query: listarMovimientosSchema }),
  controller.listar,
);
router.get(
  '/:id',
  requirePermiso('movimientos.ver'),
  validate({ params: idParamSchema }),
  controller.obtener,
);
router.delete(
  '/:id',
  requirePermiso('movimientos.eliminar'),
  validate({ params: idParamSchema }),
  controller.eliminar,
);

export default router;
