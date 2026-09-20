import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './notificaciones.controller';
import { idParamSchema, listarNotificacionesSchema } from './notificaciones.schema';

const router = Router();

// Notifications are always the caller's own, so no permission key is required.
router.use(authenticate);

router.get('/', validate({ query: listarNotificacionesSchema }), controller.listar);

// Literal segments must be declared before the /:id route.
router.get(
  '/no-leidas',
  validate({ query: listarNotificacionesSchema }),
  controller.noLeidas,
);
router.patch('/leer-todas', controller.marcarTodasLeidas);

router.patch(
  '/:id/leida',
  validate({ params: idParamSchema }),
  controller.marcarLeida,
);

export default router;
