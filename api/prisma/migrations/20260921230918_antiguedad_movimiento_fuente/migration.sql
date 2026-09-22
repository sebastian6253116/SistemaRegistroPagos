-- AlterTable
ALTER TABLE `pagos_reportados` ADD COLUMN `fuente_derivacion` ENUM('reporte', 'movimiento') NULL;
