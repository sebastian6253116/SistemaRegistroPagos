import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import * as controller from './reportes.controller';
import {
  exportQuerySchema,
  reporteQuerySchema,
  tipoReporteParamSchema,
} from './reportes.schema';

const router = Router();

router.use(authenticate);

// Exports are declared per report type and guarded by the export permission.
router.get(
  '/:tipo/export',
  requirePermiso('reportes.exportar'),
  validate({ params: tipoReporteParamSchema, query: exportQuerySchema }),
  controller.exportar,
);

const ver = requirePermiso('reportes.ver');

router.get('/cobros', ver, validate({ query: reporteQuerySchema }), controller.cobros);
router.get('/por-cobrador', ver, validate({ query: reporteQuerySchema }), controller.porCobrador);
router.get('/nuevo-viejo', ver, validate({ query: reporteQuerySchema }), controller.nuevoViejo);
router.get('/tasas', ver, validate({ query: reporteQuerySchema }), controller.tasas);
router.get('/pendientes', ver, validate({ query: reporteQuerySchema }), controller.pendientes);
router.get(
  '/movimientos-no-conciliados',
  ver,
  validate({ query: reporteQuerySchema }),
  controller.movimientosNoConciliados,
);
router.get(
  '/pagos-sin-respaldo',
  ver,
  validate({ query: reporteQuerySchema }),
  controller.pagosSinRespaldo,
);
router.get('/flujo-caja', ver, validate({ query: reporteQuerySchema }), controller.flujoCaja);
router.get('/gastos', ver, validate({ query: reporteQuerySchema }), controller.gastos);

export default router;
