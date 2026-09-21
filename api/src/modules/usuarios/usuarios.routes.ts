import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './usuarios.controller';
import {
  createUsuarioSchema,
  listUsuariosQuerySchema,
  updateUsuarioSchema,
  usuarioIdParamSchema,
} from './usuarios.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermiso('usuarios.ver'),
  validate({ query: listUsuariosQuerySchema }),
  controller.list,
);
router.get(
  '/:id',
  requirePermiso('usuarios.ver'),
  validate({ params: usuarioIdParamSchema }),
  controller.getById,
);
router.post(
  '/',
  requirePermiso('usuarios.crear'),
  validate({ body: createUsuarioSchema }),
  controller.create,
);
router.put(
  '/:id',
  requirePermiso('usuarios.editar'),
  validate({ params: usuarioIdParamSchema, body: updateUsuarioSchema }),
  controller.update,
);
router.delete(
  '/:id',
  requirePermiso('usuarios.eliminar'),
  validate({ params: usuarioIdParamSchema }),
  controller.remove,
);
router.delete(
  '/:id/definitivo',
  requirePermiso('usuarios.eliminar_definitivo'),
  validate({ params: usuarioIdParamSchema }),
  controller.removeDefinitivo,
);

export default router;
