import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './tipos-pago.controller';
import {
  createTipoPagoSchema,
  listTiposPagoQuerySchema,
  tipoPagoIdParamSchema,
  updateTipoPagoSchema,
} from './tipos-pago.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermiso('tipos_pago.ver'),
  validate({ query: listTiposPagoQuerySchema }),
  controller.list,
);
router.get(
  '/:id',
  requirePermiso('tipos_pago.ver'),
  validate({ params: tipoPagoIdParamSchema }),
  controller.getById,
);
router.post(
  '/',
  requirePermiso('tipos_pago.gestionar'),
  validate({ body: createTipoPagoSchema }),
  controller.create,
);
router.put(
  '/:id/default',
  requirePermiso('tipos_pago.gestionar'),
  validate({ params: tipoPagoIdParamSchema }),
  controller.setDefault,
);
router.put(
  '/:id',
  requirePermiso('tipos_pago.gestionar'),
  validate({ params: tipoPagoIdParamSchema, body: updateTipoPagoSchema }),
  controller.update,
);
router.delete(
  '/:id',
  requirePermiso('tipos_pago.gestionar'),
  validate({ params: tipoPagoIdParamSchema }),
  controller.remove,
);

export default router;
