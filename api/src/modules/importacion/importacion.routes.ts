import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth';
import { requirePermiso } from '../../middleware/requirePermiso';
import { validate } from '../../middleware/validate';
import { importLimiter } from '../../middleware/rateLimit';
import * as controller from './importacion.controller';
import {
  idParamSchema,
  importarBodySchema,
  listarLotesSchema,
  previewQuerySchema,
} from './importacion.schema';
import { ApiError } from '../../lib/http';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (!ok) {
      cb(ApiError.badRequest('Formato no soportado. Use .xlsx, .xls o .csv'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.use(authenticate);

// Downloadable .xlsx template so users can load the file with the right format.
router.get(
  '/plantilla',
  requirePermiso('movimientos.importar'),
  controller.plantilla,
);

router.post(
  '/preview',
  requirePermiso('movimientos.importar'),
  importLimiter,
  upload.single('archivo'),
  validate({ query: previewQuerySchema }),
  controller.previsualizar,
);
router.post(
  '/confirmar',
  requirePermiso('movimientos.importar'),
  importLimiter,
  upload.single('archivo'),
  validate({ body: importarBodySchema }),
  controller.importar,
);

// Import history (readable by anyone who can import, plus movement viewers).
router.get(
  '/lotes',
  requirePermiso.some('movimientos.importar', 'movimientos.ver'),
  validate({ query: listarLotesSchema }),
  controller.listarLotes,
);
router.get(
  '/lotes/:id',
  requirePermiso.some('movimientos.importar', 'movimientos.ver'),
  validate({ params: idParamSchema }),
  controller.obtenerLote,
);
router.get(
  '/lotes/:id/errores',
  requirePermiso('movimientos.importar'),
  validate({ params: idParamSchema }),
  controller.erroresLote,
);

export default router;
