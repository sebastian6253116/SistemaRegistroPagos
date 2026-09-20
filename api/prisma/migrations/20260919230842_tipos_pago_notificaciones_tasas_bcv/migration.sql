-- AlterTable
ALTER TABLE `pagos_reportados` ADD COLUMN `soporte_url` VARCHAR(500) NULL,
    ADD COLUMN `tipo_pago_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `tipos_pago` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tipos_pago_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasas_bcv` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `api_id` VARCHAR(64) NOT NULL,
    `fecha` DATE NOT NULL,
    `usd` DECIMAL(18, 6) NOT NULL,
    `fuente` VARCHAR(120) NULL,
    `fecha_api` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tasas_bcv_api_id_key`(`api_id`),
    INDEX `tasas_bcv_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `tipo` VARCHAR(50) NOT NULL,
    `titulo` VARCHAR(150) NOT NULL,
    `mensaje` VARCHAR(500) NOT NULL,
    `entidad` VARCHAR(60) NULL,
    `entidad_id` INTEGER NULL,
    `leida` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notificaciones_usuario_id_leida_idx`(`usuario_id`, `leida`),
    INDEX `notificaciones_usuario_id_created_at_idx`(`usuario_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `pagos_reportados_tipo_pago_id_idx` ON `pagos_reportados`(`tipo_pago_id`);

-- AddForeignKey
ALTER TABLE `pagos_reportados` ADD CONSTRAINT `pagos_reportados_tipo_pago_id_fkey` FOREIGN KEY (`tipo_pago_id`) REFERENCES `tipos_pago`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notificaciones` ADD CONSTRAINT `notificaciones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
