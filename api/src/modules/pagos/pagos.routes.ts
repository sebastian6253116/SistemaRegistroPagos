import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import { soporteUpload } from '../../lib/upload';
import * as controller from './pagos.controller';
import {
  editarPagoSchema,
  idParamSchema,
  listarPagosSchema,
  rechazarPagoSchema,
  reportarPagoSchema,
  revertirPagoSchema,
  validarLoteSchema,
  validarPagoSchema,
} from './pagos.schema';

const router = Router();

router.use(authenticate);

// Report a payment (collector) and list payments (with data-layer isolation).
router.post('/', requirePermiso('pagos.reportar'), validate({ body: reportarPagoSchema }), controller.reportar);
router.get(
  '/',
  requirePermiso.some('pagos.ver_todos', 'pagos.ver_propios'),
  validate({ query: listarPagosSchema }),
  controller.listar,
);

// Bulk validation must be declared before the /:id routes.
router.post(
  '/validar-lote',
  requirePermiso('pagos.validar_lote'),
  validate({ body: validarLoteSchema }),
  controller.validarLote,
);

router.get(
  '/:id',
  requirePermiso.some('pagos.ver_todos', 'pagos.ver_propios'),
  validate({ params: idParamSchema }),
  controller.obtener,
);
router.put(
  '/:id',
  requirePermiso.some('pagos.reportar', 'pagos.editar'),
  validate({ params: idParamSchema, body: editarPagoSchema }),
  controller.editar,
);

// Support evidence for a pending payment (collector-isolated).
router.post(
  '/:id/soporte',
  requirePermiso.some('pagos.reportar', 'pagos.editar'),
  validate({ params: idParamSchema }),
  soporteUpload(),
  controller.subirSoporte,
);

// Reconciliation actions.
router.get(
  '/:id/coincidencias',
  requirePermiso('pagos.validar'),
  validate({ params: idParamSchema }),
  controller.coincidencias,
);
router.post(
  '/:id/validar',
  requirePermiso('pagos.validar'),
  validate({ params: idParamSchema, body: validarPagoSchema }),
  controller.validar,
);
router.post(
  '/:id/rechazar',
  requirePermiso('pagos.rechazar'),
  validate({ params: idParamSchema, body: rechazarPagoSchema }),
  controller.rechazar,
);
router.post(
  '/:id/duplicado',
  requirePermiso('pagos.marcar_duplicado'),
  validate({ params: idParamSchema }),
  controller.duplicado,
);

// Revert a validated payment back to pendiente/rechazado (inverse of validar).
router.post(
  '/:id/revertir',
  requirePermiso('pagos.revertir_validacion'),
  validate({ params: idParamSchema, body: revertirPagoSchema }),
  controller.revertir,
);

// Hard-delete a non-validated payment (collector-isolated).
router.delete(
  '/:id',
  requirePermiso('pagos.eliminar'),
  validate({ params: idParamSchema }),
  controller.eliminar,
);

export default router;
