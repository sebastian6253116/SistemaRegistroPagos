import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as controller from './archivos.controller';

/**
 * Authenticated access to stored support files. There is NO public static mount
 * for the upload directory: every file is served through this router at
 * `/api/uploads/:filename`, with authorization resolved per owning record.
 */
const router = Router();

router.use(authenticate);

router.get('/:filename', controller.descargar);

export default router;
