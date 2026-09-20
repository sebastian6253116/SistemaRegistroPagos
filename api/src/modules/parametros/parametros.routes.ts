import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './parametros.controller';
import {
  bulkParametrosSchema,
  listParametrosQuerySchema,
  parametroClaveParamSchema,
  updateParametroSchema,
} from './parametros.schema';

const router = Router();

router.use(authenticate);

// Static route declared before the ':clave' param route.
router.patch(
  '/bulk',
  requirePermiso('config.editar'),
  validate({ body: bulkParametrosSchema }),
  controller.bulkUpdate,
);
router.get(
  '/',
  requirePermiso('config.ver'),
  validate({ query: listParametrosQuerySchema }),
  controller.list,
);
router.put(
  '/:clave',
  requirePermiso('config.editar'),
  validate({ params: parametroClaveParamSchema, body: updateParametroSchema }),
  controller.update,
);

export default router;
