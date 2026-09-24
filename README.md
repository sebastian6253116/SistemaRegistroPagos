# Sistema de Gestión de Cobros

Aplicación web para **gestionar y validar cobros** recibidos por pago móvil / transferencia
en bolívares, conciliarlos contra el estado de cuenta del banco recaudador y llevar el
control financiero **en USD**.

- Cobradores reportan pagos (Bs + USD); **la tasa se deriva, nunca se escribe a mano**.
- Un usuario administrativo **importa el Excel/CSV del banco** y **valida** cada pago.
- Gerencia consulta **dashboard** y **reportería** (Excel/PDF).
- **Gastos** con constancia de quién autorizó.
- **Auditoría** de todas las acciones sensibles.
- Catálogo configurable de **tipos de pago**, con **cuenta y tipo predeterminados** al registrar.
- **Comprobante** opcional (imagen o PDF) en cada pago reportado.
- **Notificaciones internas** para quienes validan pagos.
- **Modo oscuro** y diseño **responsive**: en móvil las tablas de datos se vuelven tarjetas apiladas.
- Tasa **BCV informativa** en el encabezado, independiente de la tasa derivada del pago.
- **Edición en caliente** de pagos ya validados (permiso `pagos.editar`) y control
  **«Limpiar filtros»** en todas las secciones con filtros.
- **Detección de duplicados (CR-001)** en la conciliación: un pago que coincide con un movimiento
  ya conciliado con otro pago queda `pendiente` para validación manual.

> **Historial de cambios:** el detalle consolidado de todo el ciclo de trabajo —qué cambió, por
> qué y qué queda pendiente— está en [`CHANGELOG.md`](./CHANGELOG.md).

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite, TanStack Query v5, TanStack Table v8, React Hook Form + Zod, Tailwind CSS, react-router, recharts |
| Backend | Node.js + TypeScript, Express 4, Prisma 5 |
| Base de datos | MySQL / MariaDB (`DECIMAL(18,2)` para dinero, `DECIMAL(18,6)` para tasas) |
| Auth | JWT (access + refresh con rotación), contraseñas con bcrypt |

---

## 2. Requisitos

- Node.js 18+ (probado con **v22.17.1**)
- npm 9+
- XAMPP (o cualquier MySQL/MariaDB en el puerto 3306)

---

## 3. Estructura del repositorio

```
GentionCobros/
├─ api/                     # Backend (Express + Prisma)
│  ├─ prisma/
│  │  ├─ schema.prisma      # Modelo de datos
│  │  ├─ migrations/        # Migraciones versionadas
│  │  └─ seed.ts            # Roles, permisos, Banca Amiga, usuarios de prueba
│  ├─ src/
│  │  ├─ config/            # Carga y validación de variables de entorno
│  │  ├─ lib/               # dinero, clasificación, auditoría, http, parámetros, parser BCV
│  │  ├─ middleware/        # auth, permisos, validación, errores, rate limit
│  │  ├─ jobs/              # Tareas en segundo plano (sincronización horaria de la tasa BCV)
│  │  └─ modules/           # Un módulo por dominio (routes/controller/service/schema)
│  ├─ tests/                # Tests unitarios (vitest), incluye el parser de la tasa BCV
│  ├─ CONVENTIONS.md        # Contrato de código del backend
│  └─ .env.example
├─ web/                     # Frontend (React + Vite)
│  └─ src/
│     ├─ components/        # UI, layout (encabezado/barra lateral), DataTable, notificaciones
│     ├─ features/          # Una carpeta por pantalla/dominio
│     ├─ hooks/             # useAuth, usePermiso, useTheme (modo claro/oscuro)
│     └─ lib/               # Cliente API, formato, claves de consulta
├─ docs/
│  ├─ schema.sql            # Script SQL completo del esquema
│  ├─ openapi.yaml          # Especificación OpenAPI 3.0.3
│  └─ postman_collection.json
├─ README.md
└─ CHANGELOG.md             # Registro consolidado del ciclo de trabajo
```

---

## 4. Puesta en marcha

### 4.1 Base de datos

Con **XAMPP** encendido (servicio MySQL en el puerto 3306):

```powershell
& "C:\xampp\mysql\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS gestion_cobros CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

También puede crearla desde phpMyAdmin. El script completo del esquema está en
`docs/schema.sql` si prefiere crearlo a mano.

### 4.2 Backend

```powershell
cd api
Copy-Item .env.example .env      # ya viene con los valores de XAMPP por defecto
npm install
npx prisma migrate deploy        # aplica las migraciones
npm run seed                     # roles, permisos, Banca Amiga, usuarios de prueba
npm run seed:demo                # (opcional) ~30 días de datos de demostración
npm run dev                      # http://localhost:4000
```

Verificación rápida:

```powershell
Invoke-RestMethod http://localhost:4000/health
```

### 4.3 Frontend

```powershell
cd web
Copy-Item .env.example .env      # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                      # http://localhost:5173
```

### 4.4 Tests

```powershell
cd api
npm test
```

---

## 5. Variables de entorno (`api/.env`)

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `PORT` | Puerto del API | `4000` |
| `CORS_ORIGIN` | Orígenes permitidos (coma-separados) | `http://localhost:5173` |
| `DATABASE_URL` | Cadena de conexión Prisma | `mysql://root@localhost:3306/gestion_cobros` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secretos de firma | cambiar en producción |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | Vigencia de tokens | `15m` / `7d` |
| `MAX_LOGIN_ATTEMPTS` | Intentos fallidos antes de bloquear | `5` |
| `LOGIN_LOCK_MINUTES` | Minutos de bloqueo | `15` |
| `BUSINESS_TIMEZONE` | Zona horaria del negocio | `America/Caracas` |
| `MATCH_AMOUNT_TOLERANCE_BS` | Tolerancia de monto (Bs) al conciliar | `0.01` |
| `MATCH_DATE_WINDOW_DAYS` | Ventana de fechas (± días) | `3` |
| `MATCH_REFERENCE_SUFFIX` | Dígitos finales para referencia parcial | `4` |
| `UMBRAL_ANTIGUEDAD_DIAS` | Umbral nuevo/viejo | `30` |
| `UPLOAD_DIR` | Carpeta de soportes | `uploads` |

> Los parámetros de negocio (tolerancias, umbral, intentos) también viven en la tabla
> `parametros` y se editan desde **Configuración → Parámetros**. Si una clave existe en la
> tabla, prevalece sobre el `.env`.

### 5.1 Parámetros de negocio agregados en esta iteración

| Clave (`parametros`) | Descripción | Valor por defecto |
|---|---|---|
| `pago.cuenta_recaudadora_default` | Cuenta recaudadora preseleccionada al registrar un pago | Cuenta principal de Banca Amiga |
| `pago.tipo_pago_default` | Tipo de pago preseleccionado al registrar un pago | `Pago Móvil` |
| `bcv.job_habilitado` | Habilita la consulta automática horaria de la tasa BCV | `1` (habilitado) |
| `pago.banco_origen_obligatorio` | Exige seleccionar el banco de origen al reportar un pago; `0` lo hace opcional | `1` (obligatorio) |

> Al editar un parámetro, la caché de configuración se invalida de inmediato: los cambios
> aplican sin esperar ni reiniciar el servidor.

---

## 6. Usuarios de prueba y credenciales

Creados por `npm run seed`. **Cambie estas credenciales antes de usar el sistema en producción.**

| Rol | Usuario | Contraseña | Email | Qué puede hacer |
|---|---|---|---|---|
| **Administrador** | `admin` | `Admin123!` | admin@cobros.local | Todo: usuarios/roles, importar, validar, configuración, auditoría |
| **Administrativo** | `administrativo` | `Admin123!` | administrativo@cobros.local | Importa el banco, valida/rechaza/edita pagos (incluidos los validados) y revierte validaciones; registra gastos |
| **Cobrador** | `cobrador1` | `Cobrador123!` | cobrador1@cobros.local | Reporta sus pagos y ve solo su historial (Carlos Cobrador) |
| **Cobrador** | `cobrador2` | `Cobrador123!` | cobrador2@cobros.local | Ídem (María Cobradora) |
| **Consultor** | `consultor` | `Admin123!` | consultor@cobros.local | Solo lectura: dashboard, reportes y consulta de pagos (no modifica nada) |

**Recuperación de contraseña:** sin servicio de correo configurado, el endpoint
`POST /api/auth/forgot-password` devuelve el token **solo cuando `NODE_ENV !== 'production'`**
(para poder probar el flujo). En producción el token se enviaría por email y nunca se retorna.

---

## 7. Roles y permisos

Modelo **granular**: tabla `permisos` + `rol_permisos`, verificado en middleware del backend
**y** usado para ocultar UI en el frontend (`usePermiso`, `<RequierePermiso>`, `ProtectedRoute`).

Claves principales (el seed define **42** en total): `pagos.reportar`, `pagos.ver_propios`,
`pagos.ver_todos`, `pagos.validar`, `pagos.ver_alerta_antiguedad`, `pagos.rechazar`, `pagos.marcar_duplicado`,
`pagos.validar_lote`, `pagos.eliminar`, `pagos.revertir_validacion`, `pagos.editar`,
`movimientos.ver`,
`movimientos.importar`, `movimientos.eliminar`, `gastos.*`, `tipos_pago.ver`, `tipos_pago.gestionar`, `tasas.ver`,
`tasas.gestionar`, `cobradores.ver`, `cobradores.gestionar`, `cobradores.eliminar_definitivo`,
`bancos.ver`, `bancos.gestionar`,
`cuentas.ver`, `cuentas.gestionar`, `dashboard.ver`, `reportes.ver`, `reportes.exportar`,
`usuarios.*`, `usuarios.eliminar_definitivo`, `roles.*`, `config.ver`, `config.editar`, `auditoria.ver`.

**Conteo de permisos por rol (verificado en la base):** Administrador **42** (todos),
Administrativo **20**, Consultor **10** y Cobrador **3**; el catálogo total sigue en **42** claves.
`movimientos.eliminar` (borrado permanente de movimientos bancarios no conciliados) se otorga
**solo** al Administrador: el Administrativo ya importa la data bancaria y no debe tener control total.

La antigüedad de un cobro **ya no** se calcula contra "hoy" ni depende de una alerta por permiso: el
veredicto (`tipo_cobro_derivado` + `fuente_derivacion = 'movimiento'`) se determina y **persiste al
validar**, como la brecha entre la `fecha_pago` reportada por el cobrador y la `fecha_ejecucion` del
movimiento bancario vinculado (0 = pago del día; positivo = movimiento anterior = viejo). El umbral
`cobro.umbral_antiguedad_dias` se lee como "**N días o más = viejo**" (`>=`). El campo
`alertaAntiguedadDias` fue retirado del contrato y de la UI; el permiso `pagos.ver_alerta_antiguedad`
**sigue en la base y el seed** pero ya **no lo lee** ni la API ni la UI (permiso huérfano).

**`pagos.ver_todos` es un permiso de SOLO LECTURA.** Permite ver los pagos de todos los
cobradores (listado y detalle), pero **no** concede escritura: las rutas de escritura sobre pagos
(`PUT /pagos/:id`, `POST /pagos/:id/soporte`) exigen `pagos.reportar` **o** `pagos.editar`. Por eso
el rol **Consultor** es estrictamente read-only aunque tenga `pagos.ver_todos`.

**Aislamiento del cobrador:** un cobrador nunca ve pagos de otro. Se aplica en la **capa de
datos** (si no tiene `pagos.ver_todos`, se fuerza `cobrador_id = <el suyo>` en el `WHERE`),
no solo en la interfaz.

---

## 8. Reglas de negocio clave

### 8.1 Tasa derivada (crítica)

**La tasa nunca se introduce a mano.** Siempre es `monto_bs / monto_usd`, redondeada a 6
decimales, calculada en el backend y persistida junto con ambos montos:

```
tasa = monto_bs / monto_usd      # 3.600,00 Bs / 20,00 USD = 180,000000
```

- Se valida `monto_usd > 0` y `monto_bs > 0` antes de dividir.
- El formulario la muestra **en vivo, de solo lectura**, mientras el cobrador escribe.
- Al corregir un monto se recalcula y el cambio queda en auditoría con el valor anterior.
- Nunca se recalcula un monto histórico con una tasa nueva.
- Si existe `tasas_referencia` para la fecha, se muestra la **desviación porcentual**
  (informativa, no bloquea).

### 8.2 Conciliación

- Coincidencia por **referencia** exacta **o por sufijo de dígitos**, siempre normalizada a
  dígitos. El sufijo de contraste es el último `match.reference_suffix` (4 por defecto) de la
  referencia reportada, o sus propios dígitos si es más corta, con un **mínimo de 4 dígitos**
  (`MIN_DIGITOS_CONTRASTE`): una referencia con menos de 4 dígitos ya no matchea por sufijo,
  solo por igualdad exacta.
- Monto en Bs con **tolerancia** (`match.amount_tolerance_bs`, 0.01 por defecto) y fecha dentro
  de **±`match.date_window_days`** (3 por defecto).
- Se presentan las coincidencias **ordenadas por puntaje** (0–100).
- Un movimiento bancario solo puede conciliarse con **un** pago; si se reusa, se bloquea.
- **Duplicado (CR-001):** si el pago coincide por referencia + monto en Bs con un movimiento
  **ya conciliado con otro pago** (misma cuenta recaudadora, **sin** ventana de fecha), la
  **validación automática se bloquea**: `POST /pagos/:id/validar` sin `movimientoBancoId`
  responde **409** y el pago **queda `pendiente`** para que un validador elija el movimiento
  manualmente. No se crea un estado nuevo ni se persiste la señal: se calcula al vuelo en
  `GET /pagos/:id/coincidencias` (`{ data, duplicado }`). La validación en lote reporta los
  duplicados dentro de su array `errores` y no los valida. Una coincidencia **única y no
  duplicada** sigue validándose automáticamente.
- Al confirmar: pago → `validado`, movimiento → `conciliado`, se crea `conciliaciones` y se audita.
- Rechazar exige `motivo_rechazo`.
- **Validación en lote** para coincidencias exactas.

### 8.3 Cobro nuevo vs. viejo

- El cobrador marca `tipo_cobro`; al **validar**, el sistema deriva el veredicto de antigüedad a
  partir del **movimiento bancario vinculado**: la brecha en días completos entre la `fecha_pago`
  reportada y la `fecha_ejecucion` del movimiento (`antiguedadEnDias`). `0` = pago del día;
  positivo = el movimiento es anterior, es decir pago viejo; negativo = el movimiento es posterior
  (nunca viejo).
- El veredicto (`tipo_cobro_derivado` + `fuente_derivacion = 'movimiento'` +
  `revisar_clasificacion`) se **persiste al validar**; al revertir la validación se limpia. Si
  difiere de la marca del cobrador, se levanta `revisar_clasificacion = true` **sin sobrescribir** lo
  que puso el cobrador.
- El umbral `cobro.umbral_antiguedad_dias` se lee como "**N días o más = viejo**" (`>=`, comparador
  final aprobado por el dueño). Un pago sin movimiento vinculado no tiene veredicto: el reporte emite
  `antiguedadDias: null` y `esViejo: false`.
- El veredicto es **visible** en la bandeja de validación (columna «Antigüedad», con `—` en un
  `pendiente` sin movimiento) y en el toast de validación (`Del día` / `Viejo (2 días)`).
- La fecha del documento (`fechaDocumento`) ya **no** alimenta este veredicto: se conserva como
  entrada opcional que solo usa la clasificación heredada al reportar.

### 8.4 Importación del Excel del banco

- Columnas: **A** Referencia, **B** Monto en bolívares, **C** Fecha de ejecución.
- Acepta `.xlsx` y `.csv`; normaliza montos con coma/punto y fechas `dd/mm/yyyy`.
- Vista previa de las primeras filas antes de confirmar.
- Detección de duplicados por índice único; se cuentan, no se insertan.
- Una fila con error **no detiene** la importación: se registra con su número de fila.
- Resumen final + descarga del detalle de errores.
- La UI ofrece **«Descargar plantilla»** (`GET /api/importacion/plantilla`, permiso
  `movimientos.importar`): un `.xlsx` con la hoja `Movimientos`, encabezado en negrita y **una fila
  de ejemplo** que debe reemplazarse o eliminarse antes de importar. Un movimiento importado por
  error **sí** se puede eliminar después (`DELETE /movimientos/:id`, permiso `movimientos.eliminar`,
  solo si **no** está conciliado; ver 10.1).

### 8.5 Gastos

Fecha, monto (Bs y USD con tasa derivada), descripción, categoría, referencia del movimiento,
**autorizado por** (texto obligatorio) y soporte opcional. **Restan** en el flujo de caja.

### 8.6 Tipos de pago y valores predeterminados

- El catálogo `tipos_pago` es configurable (alta, baja lógica, edición y orden) desde
  **Configuración → Tipos de pago**. Se siembra con Pago Móvil, Transferencia, Zelle,
  Efectivo y Taquilla.
- **No confundir `tipo_pago` con `tipo_cobro`.** `tipo_cobro` (nuevo/viejo) es la clasificación
  por antigüedad; `tipo_pago` es la forma de pago. Ambos coexisten en un pago: responden a
  "¿qué tan viejo es?" y "¿cómo se pagó?" respectivamente.
- Al registrar un pago, la cuenta recaudadora y el tipo de pago se **preseleccionan** con los
  parámetros `pago.cuenta_recaudadora_default` y `pago.tipo_pago_default` (ver 5.1). Cada
  catálogo permite fijar su propio predeterminado (`PUT /tipos-pago/:id/default`,
  `PUT /cuentas/:id/default`).
- El tipo de pago es obligatorio en el formulario web al registrar un pago nuevo. A nivel de API
  es **opcional**: si se omite, se persiste como `NULL` (los pagos históricos no lo tienen). El
  esquema **no** admite el valor `null` explícito. Cuando está presente, viaja a la bandeja de
  validación.

### 8.7 Comprobantes de pago y notificaciones

- Un pago reportado puede adjuntar un **comprobante** (imagen o PDF, máximo 5 MB) mediante
  `POST /pagos/:id/soporte`, y solo mientras el pago está `pendiente`.
- El formulario guarda primero el pago y luego sube el comprobante; si la subida falla, el pago
  queda registrado y se informa de forma explícita ("pago guardado, comprobante no cargado").
- Se crean **notificaciones internas** (`notificaciones`) cuando: se reporta un pago
  (destinatarios = usuarios activos con `pagos.validar`, excluyendo al reportante), se valida un
  pago, se rechaza un pago y, por cada pago, en la validación en lote.
- Un fallo al notificar **nunca** interrumpe la operación que lo dispara.

### 8.8 Tasa BCV (informativa)

- La tasa del BCV se registra en su propia tabla `tasas_bcv` (histórico), **separada** de
  `tasas_referencia` (tasa de referencia manual).
- **Es informativa y de solo lectura.** Se muestra en el encabezado y en Configuración → Tasa
  BCV, pero **nunca** alimenta la tasa derivada del formulario: la tasa del pago sigue
  siendo siempre `monto_bs / monto_usd`.
- Un **job en proceso** consulta `https://api.farmavid.com.ve/api/rates` cada 60 minutos, guarda
  solo las tasas nuevas (deduplicadas por el `id` de la API) y lee el flag `bcv.job_habilitado`
  en cada ciclo, por lo que puede activarse o desactivarse en caliente desde la UI. Además,
  agrega una fila al histórico **solo cuando el valor cambia**: si el `usd` es igual al último
  registrado no se inserta nada, aunque la API lo republique bajo un `id` nuevo. Solo se usa
  el valor `usd`, almacenado como cadena decimal para evitar errores de precisión.
- La API externa devuelve únicamente el último valor; el histórico lo construye esta aplicación.

### 8.9 Eliminación y reversión de pagos

- **Eliminar un pago** (`DELETE /pagos/:id`, permiso `pagos.eliminar`) solo es posible mientras el
  pago **NO está validado** (`pendiente`, `rechazado` o `duplicado`). Es un **borrado físico**; si
  el pago está `validado` el API responde **409** e indica revertir primero la validación. La
  instantánea completa del registro eliminado se guarda en la **auditoría** (entidad
  `pagos_reportados`, acción `borrar`, con `datosAntes`) **en la misma transacción** que el
  borrado: o se eliminan ambos o ninguno.
- **Revertir la validación** (`POST /pagos/:id/revertir`, permiso `pagos.revertir_validacion`) es
  el **inverso exacto** de validar y solo aplica a pagos `validado` (**409** en cualquier otro
  estado). En una sola transacción: elimina la fila de `conciliaciones`, **devuelve el movimiento
  bancario enlazado a `no_conciliado`** para que pueda conciliarse otra vez, y reinicia el pago al
  estado destino (`pendiente` o `rechazado`), limpiando `movimientoBancoId`, `validadoPor` y
  `validadoAt` (y fijando o limpiando `motivoRechazo`). El cuerpo exige `estado` y, cuando es
  `rechazado`, un `motivoRechazo` (3–1000 caracteres).
- **Ambas acciones quedan registradas en la auditoría**: la eliminación lleva la instantánea
  completa borrada y la reversión registra las instantáneas anterior y posterior.
- **Editar un pago validado** (`PUT /pagos/:id`, permiso `pagos.editar`) permite corregir los datos
  de un pago ya `validado` **sin revertirlo**. El backend re-evalúa el vínculo con el movimiento
  bancario usando los **valores nuevos** (referencia, monto dentro de la tolerancia, fecha dentro de
  la ventana y misma cuenta recaudadora): si el vínculo se mantiene, recalcula
  `conciliaciones.diferenciaBs` y audita `datosAntes`/`datosDespues` **en la misma transacción**; si
  la edición lo rompe, responde **409** y no cambia nada (primero hay que revertir la validación).
  Editar un pago `pendiente` **no** requiere `pagos.editar`: el cobrador sigue editando los propios.
  Los pagos `rechazado` y `duplicado` no son editables (**409**).

### 8.10 Banco de origen configurable (obligatorio u opcional)

- La obligatoriedad del banco de origen se controla con el parámetro
  `pago.banco_origen_obligatorio` (ver 5.1): `1` = **obligatorio** (valor sembrado por defecto,
  conserva el comportamiento previo), `0` = **opcional**.
- La columna `PagoReportado.bancoOrigenId` es **nullable**. Con la regla desactivada y sin
  selección, el pago se guarda con `banco_origen_id = NULL`; `NULL` significa "sin banco
  especificado" y **nunca** se rellena con una fila ficticia en el catálogo.
- **La API nunca devuelve un nombre de banco nulo.** Para un pago sin banco responde
  `bancoOrigen: { id: null, nombre: "N/A", codigo: "N/A" }`, de modo que las superficies (web,
  reportes, exportaciones) reciben siempre un string estable y no necesitan tratar `null`; la web
  añade además un `?? 'N/A'` defensivo. Es una decisión de contrato deliberada.
- `POST /pagos` y `PUT /pagos/:id`: `bancoOrigenId` es **opcional**. Si la regla está activa y
  falta, el API rechaza con **400** `"El banco de origen es obligatorio."`. En la edición la
  actualización es parcial (un campo ausente no cambia el banco; `null` lo limpia) y la regla se
  evalúa sobre el valor resultante.
- Se eligió una **columna nullable** en lugar de crear un banco "N/A": una fila fantasma
  contaminaría el catálogo de bancos y los filtros de los reportes.

### 8.11 Fecha de pago no puede ser futura

- No se puede **reportar** ni **editar** un pago con `fechaPago` posterior al "hoy" del negocio
  (America/Caracas, UTC-4).
- El backend es la fuente de verdad: `POST /pagos` y `PUT /pagos/:id` responden **400** con "La
  fecha del pago no puede ser mayor a la fecha de hoy." (no un `validation_error` genérico).
- El formulario de reporte y el diálogo de edición bloquean la fecha futura (`max` del input +
  mensaje inline).
- La regla usa el mismo "hoy" del negocio que el dashboard (`api/src/lib/dates.ts`,
  `hoyCaracas()`), por lo que un `fechaPago` igual a hoy o anterior siempre es válido.

---

## 9. Manejo de fechas y zonas horarias

- Las **fechas de negocio** (`fecha_pago`, `fecha_ejecucion`, `gastos.fecha`,
  `tasas_referencia.fecha`, `tasas_bcv.fecha`) se guardan como **`DATE`** (sin hora) y **nunca**
  se desplazan por zona horaria.
- Los **instantes** (`created_at`, `validado_at`, `ultimo_acceso`) se guardan en **UTC**.
- La zona del negocio (`America/Caracas`) solo decide **cuál es el "hoy" del negocio**.
- En SQL, para comparar contra timestamps en UTC se usa `UTC_TIMESTAMP()`, no `NOW()`.

---

## 10. API

- Base: `http://localhost:4000/api`
- Documentación base: `docs/openapi.yaml` (104 operaciones) y `docs/postman_collection.json`
  (104 peticiones), que ya incluyen todos los grupos actuales. Los grupos de endpoints se resumen
  en la sección 10.1.
- Todas las consultas de listado son **paginadas del lado del servidor**
  (`{ data, meta: { page, pageSize, total, totalPages } }`), con búsqueda y filtros por querystring.
- Los **montos y tasas viajan como string** en JSON (nunca floats) para no perder precisión.
- Errores uniformes: `{ error: { code, message, details? } }`.

Índices en `referencia`, `fecha`, `estado`, `cobrador_id`, `cuenta_recaudadora_id` y un índice
único sobre `(cuenta_recaudadora_id, referencia, monto_bs, fecha_ejecucion)` que bloquea
duplicados de importación.

### 10.1 Nuevas tablas y endpoints

Tablas incorporadas:

| Tabla | Modelo Prisma | Propósito |
|---|---|---|
| `tipos_pago` | `TipoPago` | Catálogo configurable de formas de pago (`nombre` único, `descripcion`, `activo`, `orden`) |
| `notificaciones` | `Notificacion` | Avisos internos por usuario (`usuarioId`, `tipo`, `titulo`, `mensaje`, `entidad`, `entidadId`, `leida`, `createdAt`) |
| `tasas_bcv` | `TasaBcv` | Histórico informativo de la tasa BCV (`apiId` único, `fecha`, `usd`, `fuente`, `fechaApi`, `createdAt`) |

Además, `pagos_reportados` incorpora `tipo_pago_id` (FK opcional a `tipos_pago`) y `soporte_url`
(comprobante).

Grupos de endpoints agregados:

- **Tipos de pago:** `GET/POST /tipos-pago`, `GET/PUT/DELETE /tipos-pago/:id` (el `DELETE` es una
  baja lógica) y `PUT /tipos-pago/:id/default`.
- **Cuentas recaudadoras:** `PUT /cuentas/:id/default`.
- **Pagos:** `POST /pagos/:id/soporte` (multipart, campo `soporte`, imagen o PDF, 5 MB, solo
  mientras el pago está `pendiente`), `DELETE /pagos/:id` (borrado físico, solo pagos NO
  validados, con la instantánea en auditoría) y `POST /pagos/:id/revertir` (inverso de validar:
  libera el movimiento y reinicia el pago a `pendiente`/`rechazado`).
- **Banco de origen (pagos):** en `POST /pagos` y `PUT /pagos/:id`, `bancoOrigenId` pasó a ser
  **opcional/nullable**. Con `pago.banco_origen_obligatorio = '1'` su ausencia responde **400**;
  los pagos sin banco se exponen como `bancoOrigen: { id: null, nombre: "N/A", codigo: "N/A" }`
  (ver 8.10).
- **Importación bancaria:** `GET /importacion/plantilla` (descarga la plantilla `.xlsx` con la
  hoja `Movimientos`: encabezado en negrita y **1 fila de ejemplo**; permiso `movimientos.importar`).
- **Movimientos bancarios:** `DELETE /movimientos/:id` (borrado físico, permiso
  `movimientos.eliminar`, solo movimientos **no** conciliados; responde **409** si está conciliado;
  la instantánea queda en la auditoría). El `GET` sigue gobernado por `movimientos.ver`.
- **Notificaciones:** `GET /notificaciones`, `GET /notificaciones/no-leidas`,
  `PATCH /notificaciones/:id/leida` y `PATCH /notificaciones/leer-todas`.
- **Tasa BCV:** `GET /tasas-bcv/actual`, `GET /tasas-bcv/historial`, `GET /tasas-bcv/job`,
  `PUT /tasas-bcv/job` y `POST /tasas-bcv/sincronizar`.
- **Catálogo de formulario:** `GET /catalogos/form-pago` ahora también devuelve `tiposPago`,
  `defaults: { cuentaRecaudadoraId, tipoPagoId }` y `reglas: { bancoOrigenObligatorio }`.
- **Archivos:** `GET /api/uploads/:filename` (descarga autenticada y autorizada por archivo; ver
  13.1). Reemplaza el antiguo servicio estático público de `uploads/`.

---

## 11. Reportería

Todos con filtro por rango de fechas, cobrador, banco y estado, exportables a **Excel** y **PDF**:

cobros por período · por cobrador · nuevo vs. viejo · análisis de tasa (con desviación y valores
atípicos) · pendientes de validación · movimientos bancarios no conciliados · pagos reportados
sin respaldo · flujo de caja · gastos por categoría y por autorizante.

**Paginación:** cada tabla principal solicita **50 filas por página** (`REPORT_PAGE_SIZE = 50`)
y renderiza controles de paginación conectados al `{ data, meta }` del servidor, de modo que se
puede recorrer el resultado completo. *Limitación conocida:* dos tablas agregadas secundarias de
la pantalla de reportes (**tasas → por cobrador** y **gastos → por autorizante**) **no** están
paginadas del lado del servidor, porque esas sub-consultas no devuelven `meta`; muestran su
conjunto de resultados completo.

---

## 12. Decisiones y supuestos

Además de los 5 supuestos de la especificación (backend Node.js + TS; "nuevo vs. viejo" por
umbral de días sin módulo de deudas; un pago ↔ un movimiento; una cuenta recaudadora activa,
Banca Amiga, con modelo multi-cuenta; tasa de referencia diaria cargada manualmente), se tomó:

1. **Framework: Express** (no NestJS) — más liviano y directo para este alcance.
2. **Hash: `bcryptjs`** (JS puro) en lugar de `argon2`/`bcrypt` nativo, para evitar toolchains
   de compilación en Windows. Es bcrypt, cumple la spec.
3. **MariaDB 10.4 en lugar de MySQL 8**: XAMPP trae MariaDB. Prisma la soporta con el provider
   `mysql` y el esquema es compatible. *(Desviación respecto del "MySQL 8" de la spec.)*
4. **Endpoints de catálogo para formularios** (`GET /catalogos/form-pago`): el cobrador necesita
   bancos y cuenta recaudadora, pero no debe tener permisos de configuración. Mínimo privilegio
   y una sola llamada para todos los dropdowns.
5. **Fechas de negocio como `DATE`**: ver sección 9.
6. **Recuperación de contraseña sin email**: el token se retorna solo en desarrollo (ver sección 6).
7. **`tipo_cobro_derivado`** se deriva del movimiento bancario vinculado al validar (brecha
   `fecha_pago` ↔ `fecha_ejecucion`), no de la fecha del documento; sin movimiento vinculado el
   reporte no emite antigüedad y el veredicto queda `null`.
8. **Soportes de gastos** se guardan en disco local (`uploads/`) y se sirven mediante
   `GET /api/uploads/:filename`, autenticado y autorizado por archivo (ver 13.1); el directorio
   `uploads/` ya **no** se expone públicamente. No hay almacenamiento externo. Los comprobantes de
   pago siguen el mismo criterio.
9. **Job BCV en proceso** (un `setInterval` del propio backend) en lugar de un programador
   externo (cron o cola): el alcance no justifica infraestructura adicional y permite leer el flag
   de habilitación en cada ciclo sin reiniciar. Una sincronización fallida se registra y se
   descarta; nunca interrumpe el proceso.
10. **Notificaciones por polling** (cada 60 s) en lugar de websockets: sin conexión persistente ni
    infraestructura de publicación/suscripción, suficiente para el volumen del sistema.
11. **Tasa BCV en su propia tabla** (`tasas_bcv`) en lugar de reutilizar `tasas_referencia`: son
    conceptos distintos (histórico automático informativo frente a referencia manual con la que se
    compara la desviación) y no deben mezclarse.
12. **Modo oscuro** con variables CSS y persistencia en `localStorage` (`gc.theme`), más un script
    en línea en `index.html` para evitar el destello de tema al cargar. El tema claro es el
    predeterminado.
13. **Tabla adaptable en móvil**: `DataTable` acepta un `mobileCard` opcional; todas las tablas de
    las pantallas lo proveen, de modo que en móvil muestran tarjetas apiladas. Si se omitiera, la
    tabla conservaría el desplazamiento horizontal. Así no se crea un segundo componente de tabla.
14. **Banco de origen como columna nullable** en lugar de una fila "N/A" en el catálogo: un banco
    ficticio contaminaría el catálogo de `bancos` y los filtros de reportes, y obligaría a
    excluirlo en cada consulta. La ausencia se representa con `NULL` y se normaliza a
    `"N/A"` solo en el borde de salida de la API (ver 8.10).

---

## 13. Seguridad

JWT con rotación de refresh tokens · bcrypt · validación Zod en cliente y servidor · consultas
parametrizadas (Prisma) · rate limiting en login e importación · Helmet · CORS restringido por
lista de orígenes · bloqueo de cuenta tras N intentos fallidos · auditoría de acciones sensibles.

### 13.1 Soportes y comprobantes: subida endurecida y descarga autorizada

- **El directorio `uploads/` ya no se sirve públicamente.** Se eliminó el montaje
  `express.static`; una petición directa a `GET /uploads/...` responde **404**. Los archivos se
  descargan por **`GET /api/uploads/:filename`**, que exige token Bearer (**401** sin él).
- **Autorización por archivo, no solo autenticación.** El archivo se resuelve contra el registro
  que lo referencia: un **comprobante de pago** es visible con `pagos.ver_todos`, con
  `pagos.validar`, o para el **cobrador dueño** del pago; un **soporte de gasto** requiere
  `gastos.ver`. En cualquier otro caso responde **403**, y si ningún registro lo referencia
  (archivo huérfano) responde **404**, sin filtrar la existencia del archivo.
- **Subidas con lista blanca de tipos.** Solo se aceptan `image/png`, `image/jpeg`, `image/webp`,
  `image/gif` y `application/pdf`; **`image/svg+xml` y cualquier otro tipo se rechazan**. La
  extensión almacenada se **deriva del MIME validado**, nunca del nombre que envía el usuario, de
  modo que un nombre manipulado no puede colar contenido activo. El límite de **5 MB** y el
  formato almacenado `/uploads/<archivo>` no cambian.
- **Sin traversal de rutas.** El nombre se reduce con `path.basename()` y la ruta resuelta se
  verifica dentro de `UPLOAD_DIR`; los intentos con separadores, `..` o bytes de control responden
  **400**.
- **Respuesta endurecida.** `Content-Type` derivado de la lista blanca de extensiones, más
  `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` y
  `Cache-Control: private, no-store`.
- **Previsualización en el frontend.** Un `<a href>` directo no sirve porque el JWT vive en
  `localStorage` y lo adjunta un interceptor de axios; los archivos se obtienen como **blob** con
  `obtenerArchivoPrivado` y se muestran en `FilePreviewDialog` (imagen en línea, PDF embebido o
  descarga, con estados de carga y de error con reintento). El blob evita además bloqueadores de
  popups y funciona mejor en móvil.

---

## 14. Estado de entrega

| Etapa (spec §10) | Estado |
|---|---|
| 1. Esquema, migraciones y seeds | ✅ |
| 2. Autenticación y permisos | ✅ |
| 3. CRUD de configuración | ✅ |
| 4. Registro de pagos con cálculo de tasa | ✅ |
| 5. Importación del Excel bancario | ✅ |
| 6. Motor de conciliación y bandeja de validación | ✅ |
| 7. Gastos | ✅ |
| 8. Dashboard | ✅ |
| 9. Reportería y exportaciones | ✅ |
| 10. Auditoría y pulido de UX | ✅ |
| 11. Tipos de pago, notificaciones, tasa BCV, modo oscuro y móvil | ✅ |

**Tests:** 119 tests unitarios en verde en 12 archivos (cálculo de tasa, motor de conciliación
—incluidas la re-evaluación del vínculo `evaluarVinculoConciliacion` y la detección de duplicados
`coincideReferenciaMonto`—, parser de Excel, antigüedad pago ↔ movimiento, baja de movimientos y
parser de la respuesta de la tasa BCV).

**Datos de demostración:** `npm run seed:demo` genera ~30 días de actividad (pagos reportados,
conciliaciones, movimientos sin conciliar, gastos y tasas de referencia) para que el dashboard
y los reportes se vean con volumen real. Es idempotente: si ya hay datos, se omite.
