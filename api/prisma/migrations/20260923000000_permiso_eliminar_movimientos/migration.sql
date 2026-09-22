-- Permiso para eliminar movimientos bancarios no conciliados.
-- Idempotente: segura de correr sobre una base nueva o ya migrada.
INSERT IGNORE INTO `permisos` (`clave`, `descripcion`) VALUES
  ('movimientos.eliminar', 'Eliminar movimientos bancarios no conciliados');

-- Se otorga unicamente al rol Administrador (el seed usa ALL para ese rol).
-- El rol Administrativo NO lo recibe: ya importa la data bancaria y no debe
-- tener control total sobre ella. El PK compuesto (rol_id, permiso_id) hace
-- que `INSERT IGNORE` sea seguro de re-ejecutar.
INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permisos` p
  ON p.`clave` = 'movimientos.eliminar'
WHERE r.`nombre` = 'Administrador';
