-- Catalogo inicial de parametros.
--
-- El catalogo solo se insertaba desde `prisma/seed.ts`, pero produccion corre
-- UNICAMENTE `prisma migrate deploy` al arrancar: nunca ejecuta el seed. En una
-- base creada solo por migraciones la tabla `parametros` queda vacia y la
-- pestana Configuracion -> Parametros no muestra filas (p. ej. no se puede
-- editar `cobro.umbral_antiguedad_dias`).
--
-- Idempotente: `parametros.clave` es UNIQUE (`parametros_clave_key`), por lo que
-- `INSERT IGNORE` inserta solo las claves AUSENTES y omite las que ya existen.
-- Deliberadamente NO se usa `ON DUPLICATE KEY UPDATE`: asi un valor ya
-- personalizado por un administrador nunca se sobrescribe al reaplicar la
-- migracion. Los valores de abajo son los del seed actual (solo defaults).
INSERT IGNORE INTO `parametros` (`clave`, `valor`, `descripcion`, `updated_at`) VALUES
  ('match.amount_tolerance_bs', '0.01', 'Tolerancia en bolivares al cruzar montos', CURRENT_TIMESTAMP(3)),
  ('match.date_window_days', '3', 'Ventana de dias (+/-) para la fecha de ejecucion', CURRENT_TIMESTAMP(3)),
  ('match.reference_suffix', '4', 'Ultimos N digitos usados para referencia parcial', CURRENT_TIMESTAMP(3)),
  ('cobro.umbral_antiguedad_dias', '30', 'Dias para clasificar un cobro como viejo', CURRENT_TIMESTAMP(3)),
  ('login.max_attempts', '5', 'Intentos fallidos antes de bloquear el usuario', CURRENT_TIMESTAMP(3)),
  ('login.lock_minutes', '15', 'Minutos de bloqueo tras superar los intentos', CURRENT_TIMESTAMP(3)),
  ('pago.banco_origen_obligatorio', '1', 'Exige seleccionar el banco de origen al reportar un pago', CURRENT_TIMESTAMP(3));
