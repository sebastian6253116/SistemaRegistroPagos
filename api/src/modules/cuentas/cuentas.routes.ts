import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './cuentas.controller';
import {
  createCuentaSchema,
  cuentaIdParamSchema,
  listCuentasQuerySchema,
  updateCuentaSchema,
} from './cuentas.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermiso('cuentas.ver'),
  validate({ query: listCuentasQuerySchema }),
  controller.list,
);
router.get(
  '/:id',
  requirePermiso('cuentas.ver'),
  validate({ params: cuentaIdParamSchema }),
  controller.getById,
);
router.post(
  '/',
  requirePermiso('cuentas.gestionar'),
  validate({ body: createCuentaSchema }),
  controller.create,
);
router.put(
  '/:id/default',
  requirePermiso('cuentas.gestionar'),
  validate({ params: cuentaIdParamSchema }),
  controller.setDefault,
);
router.put(
  '/:id',
  requirePermiso('cuentas.gestionar'),
  validate({ params: cuentaIdParamSchema, body: updateCuentaSchema }),
  controller.update,
);
router.delete(
  '/:id',
  requirePermiso('cuentas.gestionar'),
  validate({ params: cuentaIdParamSchema }),
  controller.remove,
);

export default router;
