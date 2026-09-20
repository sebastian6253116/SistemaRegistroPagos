import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './movimientos.controller';
import { idParamSchema, listarMovimientosSchema } from './movimientos.schema';

const router = Router();

router.use(authenticate, requirePermiso('movimientos.ver'));

router.get('/', validate({ query: listarMovimientosSchema }), controller.listar);
router.get('/:id', validate({ params: idParamSchema }), controller.obtener);

export default router;
