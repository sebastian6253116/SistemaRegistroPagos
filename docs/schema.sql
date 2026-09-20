-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permisos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clave` VARCHAR(100) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permisos_clave_key`(`clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rol_permisos` (
    `rol_id` INTEGER NOT NULL,
    `permiso_id` INTEGER NOT NULL,

    PRIMARY KEY (`rol_id`, `permiso_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre_completo` VARCHAR(150) NOT NULL,
    `usuario` VARCHAR(60) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `rol_id` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `intentos_fallidos` INTEGER NOT NULL DEFAULT 0,
    `bloqueado_hasta` DATETIME(3) NULL,
    `ultimo_acceso` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_usuario_key`(`usuario`),
    UNIQUE INDEX `usuarios_email_key`(`email`),
    INDEX `usuarios_rol_id_idx`(`rol_id`),
    INDEX `usuarios_activo_idx`(`activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_resets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_resets_token_hash_key`(`token_hash`),
    INDEX `password_resets_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cobradores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `codigo` VARCHAR(40) NOT NULL,
    `usuario_id` INTEGER NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cobradores_codigo_key`(`codigo`),
    UNIQUE INDEX `cobradores_usuario_id_key`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bancos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(120) NOT NULL,
    `codigo` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bancos_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cuentas_recaudadoras` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `banco_id` INTEGER NOT NULL,
    `numero_cuenta` VARCHAR(40) NOT NULL,
    `alias` VARCHAR(120) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cuentas_recaudadoras_banco_id_numero_cuenta_key`(`banco_id`, `numero_cuenta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
CREATE TABLE `pagos_reportados` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cobrador_id` INTEGER NOT NULL,
    `fecha_pago` DATE NOT NULL,
    `referencia` VARCHAR(60) NOT NULL,
    `banco_origen_id` INTEGER NULL,
    `cuenta_recaudadora_id` INTEGER NOT NULL,
    `monto_bs` DECIMAL(18, 2) NOT NULL,
    `monto_usd` DECIMAL(18, 2) NOT NULL,
    `tasa` DECIMAL(18, 6) NOT NULL,
    `cliente` VARCHAR(180) NULL,
    `concepto` VARCHAR(255) NULL,
    `tipo_pago_id` INTEGER NULL,
    `soporte_url` VARCHAR(500) NULL,
    `tipo_cobro` ENUM('nuevo', 'viejo') NOT NULL,
    `tipo_cobro_derivado` ENUM('nuevo', 'viejo') NULL,
    `revisar_clasificacion` BOOLEAN NOT NULL DEFAULT false,
    `observaciones` TEXT NULL,
    `estado` ENUM('pendiente', 'validado', 'rechazado', 'duplicado') NOT NULL DEFAULT 'pendiente',
    `movimiento_banco_id` INTEGER NULL,
    `validado_por` INTEGER NULL,
    `validado_at` DATETIME(3) NULL,
    `motivo_rechazo` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pagos_reportados_movimiento_banco_id_key`(`movimiento_banco_id`),
    INDEX `pagos_reportados_referencia_idx`(`referencia`),
    INDEX `pagos_reportados_fecha_pago_idx`(`fecha_pago`),
    INDEX `pagos_reportados_estado_idx`(`estado`),
    INDEX `pagos_reportados_cobrador_id_idx`(`cobrador_id`),
    INDEX `pagos_reportados_cuenta_recaudadora_id_idx`(`cuenta_recaudadora_id`),
    INDEX `pagos_reportados_tipo_pago_id_idx`(`tipo_pago_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_banco` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lote_importacion_id` INTEGER NULL,
    `cuenta_recaudadora_id` INTEGER NOT NULL,
    `referencia` VARCHAR(60) NOT NULL,
    `monto_bs` DECIMAL(18, 2) NOT NULL,
    `fecha_ejecucion` DATE NOT NULL,
    `estado_conciliacion` ENUM('no_conciliado', 'conciliado') NOT NULL DEFAULT 'no_conciliado',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `movimientos_banco_referencia_idx`(`referencia`),
    INDEX `movimientos_banco_fecha_ejecucion_idx`(`fecha_ejecucion`),
    INDEX `movimientos_banco_estado_conciliacion_idx`(`estado_conciliacion`),
    INDEX `movimientos_banco_cuenta_recaudadora_id_idx`(`cuenta_recaudadora_id`),
    UNIQUE INDEX `movimientos_banco_cuenta_recaudadora_id_referencia_monto_bs__key`(`cuenta_recaudadora_id`, `referencia`, `monto_bs`, `fecha_ejecucion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lotes_importacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `nombre_archivo` VARCHAR(255) NOT NULL,
    `filas_totales` INTEGER NOT NULL DEFAULT 0,
    `insertadas` INTEGER NOT NULL DEFAULT 0,
    `duplicadas` INTEGER NOT NULL DEFAULT 0,
    `con_error` INTEGER NOT NULL DEFAULT 0,
    `detalle_errores` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lotes_importacion_usuario_id_idx`(`usuario_id`),
    INDEX `lotes_importacion_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conciliaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pago_reportado_id` INTEGER NOT NULL,
    `movimiento_banco_id` INTEGER NOT NULL,
    `usuario_id` INTEGER NOT NULL,
    `tipo` ENUM('automatica', 'manual') NOT NULL,
    `diferencia_bs` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `conciliaciones_pago_reportado_id_key`(`pago_reportado_id`),
    UNIQUE INDEX `conciliaciones_movimiento_banco_id_key`(`movimiento_banco_id`),
    INDEX `conciliaciones_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gastos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL,
    `monto_bs` DECIMAL(18, 2) NOT NULL,
    `monto_usd` DECIMAL(18, 2) NOT NULL,
    `tasa` DECIMAL(18, 6) NOT NULL,
    `movimiento_banco_id` INTEGER NULL,
    `referencia` VARCHAR(60) NULL,
    `descripcion` VARCHAR(500) NOT NULL,
    `categoria` VARCHAR(100) NOT NULL,
    `autorizado_por` VARCHAR(180) NOT NULL,
    `registrado_por` INTEGER NOT NULL,
    `soporte_url` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `gastos_fecha_idx`(`fecha`),
    INDEX `gastos_categoria_idx`(`categoria`),
    INDEX `gastos_registrado_por_idx`(`registrado_por`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasas_referencia` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL,
    `valor` DECIMAL(18, 6) NOT NULL,
    `fuente` VARCHAR(120) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tasas_referencia_fecha_key`(`fecha`),
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
CREATE TABLE `auditoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NULL,
    `entidad` VARCHAR(80) NOT NULL,
    `entidad_id` INTEGER NULL,
    `accion` VARCHAR(60) NOT NULL,
    `datos_antes` JSON NULL,
    `datos_despues` JSON NULL,
    `ip` VARCHAR(60) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `auditoria_usuario_id_idx`(`usuario_id`),
    INDEX `auditoria_entidad_idx`(`entidad`),
    INDEX `auditoria_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parametros` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clave` VARCHAR(100) NOT NULL,
    `valor` VARCHAR(255) NOT NULL,
    `descripcion` VARCHAR(255) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `parametros_clave_key`(`clave`),
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

-- AddForeignKey
ALTER TABLE `rol_permisos` ADD CONSTRAINT `rol_permisos_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rol_permisos` ADD CONSTRAINT `rol_permisos_permiso_id_fkey` FOREIGN KEY (`permiso_id`) REFERENCES `permisos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_resets` ADD CONSTRAINT `password_resets_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cobradores` ADD CONSTRAINT `cobradores_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cuentas_recaudadoras` ADD CONSTRAINT `cuentas_recaudadoras_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_reportados` ADD CONSTRAINT `pagos_reportados_cobrador_id_fkey` FOREIGN KEY (`cobrador_id`) REFERENCES `cobradores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_reportados` ADD CONSTRAINT `pagos_reportados_banco_origen_id_fkey` FOREIGN KEY (`banco_origen_id`) REFERENCES `bancos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_reportados` ADD CONSTRAINT `pagos_reportados_cuenta_recaudadora_id_fkey` FOREIGN KEY (`cuenta_recaudadora_id`) REFERENCES `cuentas_recaudadoras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_reportados` ADD CONSTRAINT `pagos_reportados_tipo_pago_id_fkey` FOREIGN KEY (`tipo_pago_id`) REFERENCES `tipos_pago`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_reportados` ADD CONSTRAINT `pagos_reportados_movimiento_banco_id_fkey` FOREIGN KEY (`movimiento_banco_id`) REFERENCES `movimientos_banco`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_reportados` ADD CONSTRAINT `pagos_reportados_validado_por_fkey` FOREIGN KEY (`validado_por`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_banco` ADD CONSTRAINT `movimientos_banco_lote_importacion_id_fkey` FOREIGN KEY (`lote_importacion_id`) REFERENCES `lotes_importacion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_banco` ADD CONSTRAINT `movimientos_banco_cuenta_recaudadora_id_fkey` FOREIGN KEY (`cuenta_recaudadora_id`) REFERENCES `cuentas_recaudadoras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lotes_importacion` ADD CONSTRAINT `lotes_importacion_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conciliaciones` ADD CONSTRAINT `conciliaciones_pago_reportado_id_fkey` FOREIGN KEY (`pago_reportado_id`) REFERENCES `pagos_reportados`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conciliaciones` ADD CONSTRAINT `conciliaciones_movimiento_banco_id_fkey` FOREIGN KEY (`movimiento_banco_id`) REFERENCES `movimientos_banco`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conciliaciones` ADD CONSTRAINT `conciliaciones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gastos` ADD CONSTRAINT `gastos_registrado_por_fkey` FOREIGN KEY (`registrado_por`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditoria` ADD CONSTRAINT `auditoria_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notificaciones` ADD CONSTRAINT `notificaciones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

