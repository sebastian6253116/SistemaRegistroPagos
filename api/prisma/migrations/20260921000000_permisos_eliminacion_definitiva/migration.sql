-- Permisos para la eliminacion definitiva (hard delete) de usuarios y cobradores.
-- Idempotente: segura de correr sobre una base nueva o ya migrada.
INSERT IGNORE INTO `permisos` (`clave`, `descripcion`) VALUES
  ('usuarios.eliminar_definitivo', 'Eliminar definitivamente usuarios sin historial'),
  ('cobradores.eliminar_definitivo', 'Eliminar definitivamente cobradores sin pagos');

-- Se otorgan al rol Administrador (el seed usa ALL para ese rol).
INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permisos` p
  ON p.`clave` IN ('usuarios.eliminar_definitivo', 'cobradores.eliminar_definitivo')
WHERE r.`nombre` = 'Administrador';
