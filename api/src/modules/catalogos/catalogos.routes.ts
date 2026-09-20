import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/http';
import { getConfigValues } from '../../lib/config-values';

/**
 * Lightweight read-only catalogs for form dropdowns.
 *
 * Rationale: a collector needs the list of origin banks and the active
 * collection account to report a payment, but must NOT be granted the full
 * `bancos.ver` / `cuentas.ver` configuration permissions. This single endpoint
 * serves every form in one round-trip (better UX, least privilege).
 */
const router = Router();

router.use(authenticate);

router.get(
  '/form-pago',
  asyncHandler(async (_req, res) => {
    const [bancos, cuentasRecaudadoras, tiposPago, config] = await Promise.all([
      prisma.banco.findMany({
        select: { id: true, nombre: true, codigo: true },
        orderBy: { nombre: 'asc' },
      }),
      prisma.cuentaRecaudadora.findMany({
        where: { activo: true },
        select: {
          id: true,
          numeroCuenta: true,
          alias: true,
          banco: { select: { id: true, nombre: true, codigo: true } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.tipoPago.findMany({
        where: { activo: true },
        select: { id: true, nombre: true, descripcion: true },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      }),
      getConfigValues(),
    ]);

    // Drop a configured default when it no longer exists or is inactive,
    // reusing the lists fetched above instead of an extra lookup.
    const defaults = {
      cuentaRecaudadoraId: cuentasRecaudadoras.some(
        (c) => c.id === config.cuentaRecaudadoraDefault,
      )
        ? config.cuentaRecaudadoraDefault
        : null,
      tipoPagoId: tiposPago.some((t) => t.id === config.tipoPagoDefault)
        ? config.tipoPagoDefault
        : null,
    };

    // Runtime business rules the form needs to render/validate itself.
    const reglas = {
      bancoOrigenObligatorio: config.bancoOrigenObligatorio,
    };

    res.json({ bancos, cuentasRecaudadoras, tiposPago, defaults, reglas });
  }),
);

export default router;
