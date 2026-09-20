-- AlterTable
ALTER TABLE `gastos` MODIFY `fecha` DATE NOT NULL;

-- AlterTable
ALTER TABLE `movimientos_banco` MODIFY `fecha_ejecucion` DATE NOT NULL;

-- AlterTable
ALTER TABLE `pagos_reportados` MODIFY `fecha_pago` DATE NOT NULL;

-- AlterTable
ALTER TABLE `tasas_referencia` MODIFY `fecha` DATE NOT NULL;
