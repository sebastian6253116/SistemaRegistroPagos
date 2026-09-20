import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './tasas-bcv.controller';
import { historialBcvQuerySchema, jobConfigSchema } from './tasas-bcv.schema';

const router = Router();

router.use(authenticate);

// Informational header rate: any authenticated user.
router.get('/actual', controller.actual);

// Surfaces inside the Auditoria screen.
router.get(
  '/historial',
  requirePermiso('auditoria.ver'),
  validate({ query: historialBcvQuerySchema }),
  controller.historial,
);

// Job toggle lives in the configuration screen.
router.get('/job', requirePermiso('config.ver'), controller.getJob);
router.put(
  '/job',
  requirePermiso('config.editar'),
  validate({ body: jobConfigSchema }),
  controller.updateJob,
);
router.post('/sincronizar', requirePermiso('config.editar'), controller.sincronizar);

export default router;
