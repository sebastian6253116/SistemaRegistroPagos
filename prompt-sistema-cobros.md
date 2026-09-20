# Prompt: Sistema de Gestión de Cobros

Actúa como arquitecto y desarrollador full-stack senior. Construye una aplicación web de **gestión y validación de cobros** siguiendo esta especificación. No inventes requisitos: si algo no está definido aquí, márcalo como supuesto en el README y sigue la opción más simple y estándar.

---

## 1. Objetivo

Un sistema donde:

1. Varios **cobradores** reportan los pagos que reciben de clientes (pago móvil / transferencia en bolívares).
2. Un **usuario administrativo** importa el estado de cuenta del banco recaudador y **valida** cada pago reportado, cruzándolo contra el movimiento real del banco.
3. La gerencia consulta un **dashboard** y **reportería** con todo cuadrado en dólares.
4. Se lleva además un **registro de gastos** asociado a esos fondos, con constancia de quién autorizó.

Todo el control financiero se lleva **en USD**, aunque los pagos entren en bolívares.

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estado servidor | TanStack Query |
| Formularios | React Hook Form + Zod |
| Tablas | TanStack Table con paginación y ordenamiento del lado del servidor |
| UI | Tailwind CSS + shadcn/ui, mobile-first |
| Backend | Node.js + TypeScript (Express o NestJS) — API REST |
| ORM | Prisma o Sequelize, con migraciones versionadas |
| Base de datos | **MySQL 8** |
| Auth | JWT (access + refresh), contraseñas con argon2 o bcrypt |

Reglas técnicas obligatorias:

- **Nunca uses `FLOAT`/`DOUBLE` para dinero.** Montos en `DECIMAL(18,2)`, tasas en `DECIMAL(18,6)`.
- Los cálculos de tasa y los totales se hacen **en el backend**; el frontend nunca es fuente de verdad.
- Zona horaria del negocio: `America/Caracas`. Guarda timestamps en UTC y formatea en el cliente.
- Toda consulta de listado es paginada del lado del servidor, con búsqueda y filtros por querystring.
- Índices en: `referencia`, `fecha`, `estado`, `cobrador_id`, `cuenta_recaudadora_id`.

---

## 3. Roles y permisos

Sistema de permisos granular (no roles hardcodeados en el código: tabla `permisos` + `rol_permisos`, verificados en middleware del backend **y** usados para ocultar UI en el frontend).

| Rol | Puede |
|---|---|
| **Administrador** | Todo. Crea usuarios y roles, importa data bancaria, valida, edita configuración, ve auditoría. |
| **Administrativo** | Importa el Excel del banco, valida/rechaza pagos reportados, registra gastos. No gestiona usuarios. |
| **Cobrador** | Reporta sus propios pagos y consulta únicamente el historial de lo que él reportó. |
| **Consultor** | Solo lectura: dashboard y reportes. No modifica nada. |

Un cobrador **nunca** ve pagos de otro cobrador. Aplica ese filtro en la capa de datos, no solo en la UI.

---

## 4. Modelo de datos

Crea las migraciones para estas tablas (nombres orientativos, ajusta a la convención del ORM):

### Seguridad y catálogos
- `usuarios` — id, nombre_completo, usuario, email, password_hash, rol_id, activo, ultimo_acceso, timestamps
- `roles` — id, nombre, descripcion
- `permisos` — id, clave (ej. `pagos.validar`, `gastos.crear`), descripcion
- `rol_permisos` — rol_id, permiso_id
- `cobradores` — id, nombre, codigo, usuario_id (nullable), activo
- `bancos` — id, nombre, codigo
- `cuentas_recaudadoras` — id, banco_id, numero_cuenta, alias, activo
  - Semilla inicial: la cuenta recaudadora de **Banca Amiga**.

### Operación
- `pagos_reportados` — lo que carga el cobrador:
  - id, cobrador_id, fecha_pago, referencia, banco_origen_id, cuenta_recaudadora_id
  - monto_bs `DECIMAL(18,2)`, monto_usd `DECIMAL(18,2)`, tasa `DECIMAL(18,6)`
  - cliente / concepto, tipo_cobro (`nuevo` | `viejo`), observaciones
  - estado (`pendiente` | `validado` | `rechazado` | `duplicado`)
  - movimiento_banco_id (nullable), validado_por, validado_at, motivo_rechazo
  - timestamps

- `movimientos_banco` — lo que viene del Excel del banco:
  - id, lote_importacion_id, cuenta_recaudadora_id
  - referencia, monto_bs `DECIMAL(18,2)`, fecha_ejecucion
  - estado_conciliacion (`no_conciliado` | `conciliado`)
  - índice único sobre (cuenta_recaudadora_id, referencia, monto_bs, fecha_ejecucion) para bloquear duplicados de importación

- `lotes_importacion` — id, usuario_id, nombre_archivo, filas_totales, insertadas, duplicadas, con_error, detalle_errores (JSON), created_at

- `conciliaciones` — id, pago_reportado_id, movimiento_banco_id, usuario_id, tipo (`automatica` | `manual`), diferencia_bs, created_at

- `gastos` — id, fecha, monto_bs, monto_usd, tasa, movimiento_banco_id (nullable) o referencia (texto), descripcion, categoria, **autorizado_por (texto libre, obligatorio)**, registrado_por (usuario_id), soporte_url, timestamps

- `tasas_referencia` — id, fecha, valor `DECIMAL(18,6)`, fuente (opcional, para comparar contra la tasa implícita de los cobradores)

- `auditoria` — id, usuario_id, entidad, entidad_id, accion, datos_antes (JSON), datos_despues (JSON), ip, created_at. Registra creación, edición, validación, rechazo y borrado.

---

## 5. Reglas de negocio

### 5.1 Conversión y tasa (crítico)

**La tasa nunca se introduce a mano. La tasa es siempre el resultado de dividir los bolívares entre los dólares.**

El cobrador reporta dos cifras: **el monto en bolívares que recibió** y **la cantidad de dólares que ese pago representa** según su acuerdo con el cliente. Con esas dos cifras el sistema deduce la tasa con la que quedó registrado y validado ese pago:

```
tasa = monto_bs / monto_usd
```

Ejemplo: el cobrador reporta 3.600,00 Bs que equivalen a 20,00 USD → la tasa registrada para ese pago es 180,000000 Bs/USD.

- No existe ningún campo editable de tasa en el formulario de reporte ni en la pantalla de validación. Es un valor **derivado y de solo lectura**, mostrado en vivo mientras el cobrador escribe, para que confirme antes de guardar.
- Se calcula en el backend, se redondea a 6 decimales y se **persiste junto con ambos montos**.
- Se guardan siempre los tres valores: `monto_bs`, `monto_usd`, `tasa`. Nunca se recalcula un monto histórico con una tasa nueva.
- La tasa queda congelada al momento del reporte: si luego se corrige el monto en Bs o en USD, se recalcula y el cambio queda en auditoría con el valor anterior.
- Valida: `monto_usd > 0` y `monto_bs > 0` antes de dividir.
- Todos los totales, dashboards y reportes se expresan **en USD** por defecto, con un toggle para ver el equivalente en bolívares.
- Si existe `tasas_referencia` para esa fecha, muestra la desviación porcentual entre la tasa implícita del pago y la de referencia (solo informativo, no bloquea).

### 5.2 Conciliación

Al validar, el sistema cruza el pago reportado contra `movimientos_banco` de la cuenta recaudadora:

- **Sugerencia automática**: coincidencia por `referencia` (exacta y también por los últimos 6–8 dígitos, porque los cobradores suelen reportar la referencia parcial), monto_bs con tolerancia configurable (por defecto 0.01), y fecha dentro de ±3 días.
- Presenta las coincidencias ordenadas por puntaje; el administrativo confirma con un clic o busca manualmente.
- Un movimiento bancario solo puede conciliarse con **un** pago reportado. Si se intenta reusar, bloquea y avisa.
- Al confirmar: el pago pasa a `validado`, el movimiento a `conciliado`, se crea el registro en `conciliaciones` y se registra en auditoría.
- Rechazar exige `motivo_rechazo`.

### 5.3 Cobro nuevo vs. viejo

- El cobrador marca `tipo_cobro` al reportar.
- Adicionalmente, el sistema deriva una clasificación por antigüedad: si la diferencia entre la fecha del documento/deuda y la fecha del pago supera un umbral configurable (por defecto 30 días), se considera **viejo**.
- Si la marca del cobrador y la derivada difieren, márcalo en el reporte para revisión. No sobrescribas lo que puso el cobrador.

### 5.4 Importación del Excel del banco

Solo Administrador y Administrativo. Formato del archivo (sin encabezado garantizado, permite indicar si la primera fila es encabezado):

| Columna | Contenido |
|---|---|
| A | Referencia |
| B | Monto en bolívares |
| C | Fecha de ejecución del ingreso |

Comportamiento:

- Selección de la cuenta recaudadora destino antes de importar.
- Vista previa de las primeras 20 filas antes de confirmar.
- Procesamiento por lotes dentro de una transacción; si una fila falla, se registra el error con su número de fila y la importación continúa.
- Detección de duplicados contra el índice único: se cuentan y se informan, no se insertan.
- Al finalizar: resumen con totales (filas leídas, insertadas, duplicadas, con error) y opción de descargar el detalle de errores.
- Acepta `.xlsx` y `.csv`. Normaliza montos con coma/punto decimal y fechas en formato `dd/mm/yyyy`.

### 5.5 Gastos

- Registro de salidas de dinero con: fecha, monto (en Bs y USD con su tasa), descripción, categoría, referencia del movimiento del que se tomó el dinero y **quién autorizó** (campo de texto obligatorio, queda en el registro y en la auditoría).
- Opción de adjuntar soporte (imagen/PDF).
- Los gastos restan en el flujo de caja de los reportes.

---

## 6. Módulos y pantallas

1. **Login** con recuperación de contraseña y bloqueo tras N intentos fallidos.
2. **Dashboard**
   - Cobros del día: total USD, total Bs, cantidad de pagos, tasa promedio ponderada.
   - Comparativo contra el día anterior y contra el promedio de los últimos 7 días.
   - Pendientes por validar (con antigüedad en horas).
   - Ranking de cobradores del día.
   - Gráfico de cobros de los últimos 30 días y distribución nuevo vs. viejo.
   - Movimientos bancarios sin conciliar.
3. **Reportar pago** (cobrador) — formulario optimizado para móvil: banco origen, referencia, monto Bs, monto USD, fecha, cliente/concepto, tipo de cobro, observaciones. Muestra la tasa calculada en vivo antes de guardar.
4. **Bandeja de validación** (administrativo) — tabla de pendientes con filtros por fecha, cobrador, banco, monto y referencia, mostrando monto Bs, monto USD y la tasa derivada de ambos como valor de solo lectura (ver 5.1); panel lateral con las coincidencias sugeridas del banco; acciones validar / rechazar / marcar duplicado. Debe soportar validación en lote cuando la coincidencia es exacta.
5. **Movimientos bancarios** — consulta, filtro por estado de conciliación, acceso al lote de origen.
6. **Importación** — carga del Excel, vista previa, resultado, historial de lotes.
7. **Gastos** — alta, edición, listado con filtros.
8. **Reportes** (ver sección 7).
9. **Configuración** — usuarios y roles, permisos por rol, cobradores, bancos, cuentas recaudadoras, tasas de referencia, parámetros (tolerancias, umbral de antigüedad).
10. **Auditoría** — bitácora filtrable por usuario, entidad y rango de fechas.

---

## 7. Reportería

Todos con filtro por rango de fechas, cobrador, banco y estado; exportables a Excel y PDF:

- **Cobros por período**: detalle y consolidado en USD y Bs.
- **Por cobrador**: monto, cantidad, ticket promedio, tasa promedio ponderada, % validado vs. rechazado.
- **Nuevo vs. viejo**: monto y cantidad, participación porcentual, evolución en el tiempo.
- **Análisis de tasa**: tasa implícita por día y por cobrador, desviación contra la tasa de referencia, detección de valores atípicos.
- **Pendientes de validación**: con antigüedad, para detectar rezago.
- **Movimientos bancarios no conciliados**: dinero que entró al banco y nadie reportó.
- **Pagos reportados sin respaldo bancario**: lo inverso al anterior.
- **Flujo de caja**: ingresos validados menos gastos, por período.
- **Gastos**: por categoría y por autorizante.

---

## 8. Requisitos no funcionales

- **Responsive real**: el cobrador reporta desde el teléfono; el administrativo trabaja en escritorio con tablas densas. Diseña cada pantalla para su contexto de uso.
- **Rendimiento**: lazy loading por ruta, virtualización en tablas largas, memoización donde haya listas grandes, `staleTime` razonable en TanStack Query, debounce en búsquedas.
- **Seguridad**: validación con Zod en cliente y servidor, sanitización de entrada, consultas parametrizadas, rate limiting en login e importación, CORS restringido, headers con Helmet.
- **UX**: estados de carga y vacío explícitos, mensajes de error entendibles en español, confirmación en acciones destructivas, atajos de teclado en la bandeja de validación.
- **Idioma**: toda la interfaz en español, formato de números `es-VE`.
- **Tests**: unitarios para el cálculo de tasa, el motor de conciliación y el parser del Excel; integración para los endpoints críticos.

---

## 9. Entregables

- Monorepo o dos carpetas (`/api`, `/web`) con `README.md` de instalación y ejecución.
- Migraciones y seeds (roles, permisos, banco y cuenta recaudadora de Banca Amiga, usuario administrador inicial).
- `.env.example` documentado.
- Colección de endpoints (OpenAPI o Postman).
- Script SQL del esquema completo.

## 10. Orden de trabajo

1. Esquema de base de datos, migraciones y seeds.
2. Autenticación y sistema de permisos.
3. CRUD de configuración (usuarios, cobradores, bancos, cuentas).
4. Registro de pagos por el cobrador con el cálculo de tasa.
5. Importación del Excel bancario.
6. Motor de conciliación y bandeja de validación.
7. Gastos.
8. Dashboard.
9. Reportería y exportaciones.
10. Auditoría y pulido de UX.

Entrega cada etapa funcionando y probada antes de pasar a la siguiente.

---

## 11. Supuestos a confirmar antes de codificar

Si alguno es incorrecto, pregunta antes de avanzar:

1. El backend es Node.js + TypeScript (no se especificó lenguaje de servidor).
2. La clasificación "nuevo vs. viejo" se basa en un umbral de días configurable; no existe aún un módulo de facturas/deudas al que amarrarla.
3. Un pago reportado se concilia con un único movimiento bancario (sin pagos parciales ni agrupados).
4. Solo existe una cuenta recaudadora activa (Banca Amiga), pero el modelo soporta varias.
5. La tasa de referencia diaria se carga manualmente; no hay integración con ninguna fuente externa.
