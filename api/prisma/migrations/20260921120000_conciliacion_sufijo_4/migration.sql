-- Conciliacion: el dueno quiere contrastar por los ULTIMOS 4 DIGITOS de la
-- referencia (antes 8), no solo cambiarlo en el seed.
-- Idempotente: segura tanto en una base nueva como donde la fila ya existe.
-- `parametros.clave` es UNIQUE (`parametros_clave_key`), por lo que
-- `INSERT ... ON DUPLICATE KEY UPDATE` resuelve ambos casos en una sola
-- sentencia: inserta la fila si falta o actualiza el valor si ya existe.
-- Sintaxis compatible con MariaDB 10.4 (`VALUES()` en el UPDATE, sin alias).
INSERT INTO `parametros` (`clave`, `valor`, `descripcion`, `updated_at`)
VALUES (
  'match.reference_suffix',
  '4',
  'Ultimos N digitos usados para referencia parcial',
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  `valor` = VALUES(`valor`),
  `descripcion` = VALUES(`descripcion`),
  `updated_at` = CURRENT_TIMESTAMP(3);
