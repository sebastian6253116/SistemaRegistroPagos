-- Permiso para la alerta de "documento viejo" (pago viejo contra movimiento bancario).
-- Idempotente: segura de correr sobre una base nueva o ya migrada.
INSERT IGNORE INTO `permisos` (`clave`, `descripcion`) VALUES
  ('pagos.ver_alerta_antiguedad', 'Ver la alerta de documento viejo (pago viejo contra movimiento bancario)');

-- Se otorga al rol Administrador (el seed usa ALL para ese rol) y al rol
-- Administrativo (que es quien valida los pagos). El PK compuesto
-- (rol_id, permiso_id) hace que `INSERT IGNORE` sea seguro de re-ejecutar.
INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permisos` p
  ON p.`clave` = 'pagos.ver_alerta_antiguedad'
WHERE r.`nombre` IN ('Administrador', 'Administrativo');
