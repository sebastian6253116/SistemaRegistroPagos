import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './auditoria.controller';
import { listAuditoriaQuerySchema } from './auditoria.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermiso('auditoria.ver'),
  validate({ query: listAuditoriaQuerySchema }),
  controller.list,
);

export default router;
