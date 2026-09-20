import { Router } from 'express';
import authRouter from './modules/auth/auth.routes';
import usuariosRouter from './modules/usuarios/usuarios.routes';
import rolesRouter from './modules/roles/roles.routes';
import cobradoresRouter from './modules/cobradores/cobradores.routes';
import bancosRouter from './modules/bancos/bancos.routes';
import cuentasRouter from './modules/cuentas/cuentas.routes';
import tiposPagoRouter from './modules/tipos-pago/tipos-pago.routes';
import tasasRouter from './modules/tasas/tasas.routes';
import tasasBcvRouter from './modules/tasas-bcv/tasas-bcv.routes';
import parametrosRouter from './modules/parametros/parametros.routes';
import auditoriaRouter from './modules/auditoria/auditoria.routes';
import pagosRouter from './modules/pagos/pagos.routes';
import movimientosRouter from './modules/movimientos/movimientos.routes';
import importacionRouter from './modules/importacion/importacion.routes';
import gastosRouter from './modules/gastos/gastos.routes';
import archivosRouter from './modules/archivos/archivos.routes';
import notificacionesRouter from './modules/notificaciones/notificaciones.routes';
import dashboardRouter from './modules/dashboard/dashboard.routes';
import reportesRouter from './modules/reportes/reportes.routes';
import catalogosRouter from './modules/catalogos/catalogos.routes';

/**
 * API router. Every module router is mounted here under /api.
 * This file is the single integration point for the REST surface.
 */
const router = Router();

// Security & session.
router.use('/auth', authRouter);

// Configuration catalogs.
router.use('/usuarios', usuariosRouter);
router.use('/roles', rolesRouter);
router.use('/cobradores', cobradoresRouter);
router.use('/bancos', bancosRouter);
router.use('/cuentas', cuentasRouter);
router.use('/tipos-pago', tiposPagoRouter);
router.use('/tasas', tasasRouter);
router.use('/tasas-bcv', tasasBcvRouter);
router.use('/parametros', parametrosRouter);

// Read-only catalogs for form dropdowns (any authenticated user).
router.use('/catalogos', catalogosRouter);

// Operation.
router.use('/pagos', pagosRouter);
router.use('/movimientos', movimientosRouter);
router.use('/importacion', importacionRouter);
router.use('/gastos', gastosRouter);

// Authenticated, per-file-authorized access to uploaded support documents.
// Final path: /api/uploads/:filename (the stored `soporteUrl` remains /uploads/<file>).
router.use('/uploads', archivosRouter);

// Caller-scoped in-app notifications.
router.use('/notificaciones', notificacionesRouter);

// Reporting & audit.
router.use('/dashboard', dashboardRouter);
router.use('/reportes', reportesRouter);
router.use('/auditoria', auditoriaRouter);

export default router;
