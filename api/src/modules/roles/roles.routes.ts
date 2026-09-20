import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './roles.controller';
import { createRolSchema, listRolesQuerySchema, rolIdParamSchema, updateRolSchema } from './roles.schema';

const router = Router();

router.use(authenticate);

// Static route must be declared before the ':id' param route.
router.get(
  '/permisos',
  requirePermiso('roles.ver'),
  controller.catalog,
);
router.get('/', requirePermiso('roles.ver'), validate({ query: listRolesQuerySchema }), controller.list);
router.get(
  '/:id',
  requirePermiso('roles.ver'),
  validate({ params: rolIdParamSchema }),
  controller.getById,
);
router.post(
  '/',
  requirePermiso('roles.gestionar'),
  validate({ body: createRolSchema }),
  controller.create,
);
router.put(
  '/:id',
  requirePermiso('roles.gestionar'),
  validate({ params: rolIdParamSchema, body: updateRolSchema }),
  controller.update,
);
router.delete(
  '/:id',
  requirePermiso('roles.gestionar'),
  validate({ params: rolIdParamSchema }),
  controller.remove,
);

export default router;
