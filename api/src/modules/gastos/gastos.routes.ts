import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import { soporteUpload } from '../../lib/upload';
import * as controller from './gastos.controller';
import {
  actualizarGastoSchema,
  crearGastoSchema,
  idParamSchema,
  listarGastosQuerySchema,
} from './gastos.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermiso('gastos.ver'),
  validate({ query: listarGastosQuerySchema }),
  controller.listar,
);

router.get(
  '/:id',
  requirePermiso('gastos.ver'),
  validate({ params: idParamSchema }),
  controller.obtener,
);

router.post(
  '/',
  requirePermiso('gastos.crear'),
  validate({ body: crearGastoSchema }),
  controller.crear,
);

router.put(
  '/:id',
  requirePermiso('gastos.editar'),
  validate({ params: idParamSchema, body: actualizarGastoSchema }),
  controller.actualizar,
);

router.patch(
  '/:id',
  requirePermiso('gastos.editar'),
  validate({ params: idParamSchema, body: actualizarGastoSchema }),
  controller.actualizar,
);

router.post(
  '/:id/soporte',
  requirePermiso('gastos.editar'),
  validate({ params: idParamSchema }),
  soporteUpload(),
  controller.subirSoporte,
);

router.delete(
  '/:id',
  requirePermiso('gastos.eliminar'),
  validate({ params: idParamSchema }),
  controller.eliminar,
);

export default router;
