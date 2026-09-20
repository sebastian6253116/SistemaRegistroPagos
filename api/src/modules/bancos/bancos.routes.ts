import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './bancos.controller';
import {
  bancoIdParamSchema,
  createBancoSchema,
  listBancosQuerySchema,
  updateBancoSchema,
} from './bancos.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermiso('bancos.ver'),
  validate({ query: listBancosQuerySchema }),
  controller.list,
);
router.get(
  '/:id',
  requirePermiso('bancos.ver'),
  validate({ params: bancoIdParamSchema }),
  controller.getById,
);
router.post(
  '/',
  requirePermiso('bancos.gestionar'),
  validate({ body: createBancoSchema }),
  controller.create,
);
router.put(
  '/:id',
  requirePermiso('bancos.gestionar'),
  validate({ params: bancoIdParamSchema, body: updateBancoSchema }),
  controller.update,
);
router.delete(
  '/:id',
  requirePermiso('bancos.gestionar'),
  validate({ params: bancoIdParamSchema }),
  controller.remove,
);

export default router;
