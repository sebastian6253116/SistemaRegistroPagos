import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './cobradores.controller';
import {
  cobradorIdParamSchema,
  createCobradorSchema,
  listCobradoresQuerySchema,
  updateCobradorSchema,
} from './cobradores.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermiso('cobradores.ver'),
  validate({ query: listCobradoresQuerySchema }),
  controller.list,
);
router.get(
  '/:id',
  requirePermiso('cobradores.ver'),
  validate({ params: cobradorIdParamSchema }),
  controller.getById,
);
router.post(
  '/',
  requirePermiso('cobradores.gestionar'),
  validate({ body: createCobradorSchema }),
  controller.create,
);
router.put(
  '/:id',
  requirePermiso('cobradores.gestionar'),
  validate({ params: cobradorIdParamSchema, body: updateCobradorSchema }),
  controller.update,
);
router.delete(
  '/:id',
  requirePermiso('cobradores.gestionar'),
  validate({ params: cobradorIdParamSchema }),
  controller.remove,
);

export default router;
