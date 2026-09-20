import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './tasas.controller';
import {
  createTasaSchema,
  listTasasQuerySchema,
  tasaIdParamSchema,
  updateTasaSchema,
} from './tasas.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermiso('tasas.ver'),
  validate({ query: listTasasQuerySchema }),
  controller.list,
);
router.get(
  '/:id',
  requirePermiso('tasas.ver'),
  validate({ params: tasaIdParamSchema }),
  controller.getById,
);
router.post(
  '/',
  requirePermiso('tasas.gestionar'),
  validate({ body: createTasaSchema }),
  controller.create,
);
router.put(
  '/:id',
  requirePermiso('tasas.gestionar'),
  validate({ params: tasaIdParamSchema, body: updateTasaSchema }),
  controller.update,
);
router.delete(
  '/:id',
  requirePermiso('tasas.gestionar'),
  validate({ params: tasaIdParamSchema }),
  controller.remove,
);

export default router;
