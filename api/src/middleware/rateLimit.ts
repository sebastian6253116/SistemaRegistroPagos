import rateLimit from 'express-rate-limit';

/**
 * Rate limiters for sensitive endpoints (spec section 8).
 * Login and import are the two abuse-prone surfaces.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'too_many_requests',
      message: 'Demasiados intentos de acceso. Intente mas tarde.',
    },
  },
});

export const importLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'too_many_requests',
      message: 'Demasiadas importaciones. Intente mas tarde.',
    },
  },
});

export const passwordResetLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'too_many_requests',
      message: 'Demasiadas solicitudes. Intente mas tarde.',
    },
  },
});
