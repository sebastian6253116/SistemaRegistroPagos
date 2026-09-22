# CHANGELOG — Sistema de Gestión de Cobros

Registro **consolidado** del ciclo de trabajo que agregó nueve funcionalidades de producto,
la eliminación y reversión de pagos, el banco de origen opcional, la paginación real de reportes
y el cierre de una vulnerabilidad en la descarga de archivos.

> **Nota sobre el control de versiones:** este proyecto **no está bajo Git**. El registro
> histórico lo forman las **migraciones versionadas** de `api/prisma/migrations/` y este
> documento. Las fechas del ciclo se desprenden de los nombres de las migraciones
> (`20260919193931` → `20260920005227`, 19–20 de septiembre de 2026). Este archivo es aditivo:
> complementa a los tres README (`README.md`, `api/README.md`, `web/README.md`) y al contrato
> OpenAPI, no los reemplaza.

---

## 1. Resumen ejecutivo

| # | Iteración | Foco | Resultado principal |
|---|---|---|---|
| 1 | Nueve mejoras de producto + fix de caché | Cuenta y tipo de pago predeterminados, selector `Combobox`, atajo `A`, notificaciones internas, comprobante opcional, catálogo de tipos de pago, modo oscuro, tasa BCV informativa y job horario. | Nueve funcionalidades en producción y el parser de la tasa BCV bajo test: **51 tests** unitarios (antes 41). |
| 2 | Eliminar pago + revertir validación | `DELETE /pagos/:id` y `POST /pagos/:id/revertir`, con auditoría atómica. | Dos operaciones nuevas y **2 permisos** nuevos (`pagos.eliminar`, `pagos.revertir_validacion`): de **35 a 37**. |
| 3 | Banco de origen opcional + paginación de reportes | Columna `banco_origen_id` nullable, parámetro `pago.banco_origen_obligatorio`, normalización `"N/A"` y controles de paginación en reportes. | Se corrigió un **bug real**: la pantalla de reportes pedía siempre las primeras 20 filas e ignoraba `meta`. Ahora pagina desde el servidor con **50 filas**. |
| 4 | Seguridad de archivos | Descarga autenticada y **autorizada por archivo**, endurecimiento de subidas y previsualización en la app. | El directorio `uploads/` dejó de servirse públicamente (`GET /uploads/...` → **404**); el contenido activo (`image/svg+xml`) dejó de aceptarse. |
| 5 | Edición de pagos validados + restablecer filtros (CR-002) | Editar en caliente un pago `validado` con permiso propio y recálculo atómico de la conciliación; «Limpiar filtros» en las 14 secciones filtradas. | Permiso nuevo **`pagos.editar`**: de **37 a 38**; **0 endpoints nuevos** (OpenAPI sigue en **100** operaciones, Postman en **100** peticiones); **57 tests** (antes 51). |
| 6 | Duplicados + referencia parcial (CR-001) | Detección de duplicados al validar (un pago que matchea un movimiento ya conciliado con otro pago) y contraste por referencia con piso de 4 dígitos. | **0 endpoints nuevos** (OpenAPI **100**, Postman **100**); **71 tests** (antes 57); sin estado, columna ni migración nuevos. |
| 7 | Endurecimiento de seguridad y correctitud (auditoría de CR-002) | `Consultor` de solo lectura, brecha de permisos de `Administrativo`, monto inválido en pagos (400 en vez de 500) y `xlsx` remediado (CVE-2023-30533 / CVE-2024-22363). | **0 endpoints nuevos** (OpenAPI **100**, Postman **100**); **71 tests** sin cambios; `Administrativo` **19** permisos, catálogo total **38**. |
| 8 | Plantilla descargable de importación bancaria (CR-003) | Endpoint `GET /api/importacion/plantilla` (ExcelJS, permiso `movimientos.importar`) y botón «Descargar plantilla» con aviso de la fila de ejemplo. | **1 endpoint nuevo**: OpenAPI **100 → 101** operaciones y Postman **100 → 101** peticiones; **71 tests** sin cambios. |
| — | Transversal | Responsive móvil y documentación/contratos. | `mobileCard` en las **27 tablas** de la aplicación (18 archivos) y contratos sincronizados: OpenAPI **101** operaciones, Postman **101** peticiones. |

---

## 2. Cambios por área

### 2.1 Base de datos

**Migraciones aplicadas** (carpetas de `api/prisma/migrations/`, verificadas contra
`information_schema` de la base `gestion_cobros`):

| Migración | Qué introduce |
|---|---|
| `20260919193931_init` | Esquema base (17 tablas de aplicación, roles/permisos, catálogos, operación, auditoría y parámetros). |
| `20260919203756_fechas_como_date` | Convierte las fechas de negocio a `DATE` sin hora: `gastos.fecha`, `movimientos_banco.fecha_ejecucion`, `pagos_reportados.fecha_pago`, `tasas_referencia.fecha`. |
| `20260919230842_tipos_pago_notificaciones_tasas_bcv` | Crea `tipos_pago`, `tasas_bcv` y `notificaciones`; agrega a `pagos_reportados` las columnas `tipo_pago_id` (FK opcional) y `soporte_url`. |
| `20260920005227_banco_origen_opcional` | Hace **nullable** `pagos_reportados.banco_origen_id` (`ALTER TABLE ... MODIFY banco_origen_id INTEGER NULL`). |

**Tablas nuevas** (3):

| Tabla | Modelo Prisma | Propósito |
|---|---|---|
| `tipos_pago` | `TipoPago` | Catálogo configurable de formas de pago (nombre único, descripción, activo, orden). Es un concepto **distinto** de `tipo_cobro` (nuevo/viejo); ambos coexisten. |
| `notificaciones` | `Notificacion` | Avisos internos, una fila por destinatario. |
| `tasas_bcv` | `TasaBcv` | Histórico informativo de la tasa del BCV, deduplicado por `api_id`. |

**Columnas nuevas / modificadas** en `pagos_reportados`:
`tipo_pago_id` (INTEGER NULL, FK a `tipos_pago`), `soporte_url` (VARCHAR(500) NULL) y
`banco_origen_id` (pasa de `NOT NULL` a `NULL`).

**Conteo verificado:** `schema.prisma` define **20 modelos/tablas de aplicación**. La base
reporta **21** tablas porque incluye la tabla técnica `_prisma_migrations` de Prisma.

### 2.2 Backend

**Módulos nuevos:** `tipos-pago`, `notificaciones`, `tasas-bcv` y `archivos`
(`api/src/modules/`). Los módulos `pagos`, `cuentas` y `conciliacion` se ampliaron.

**Endpoints agregados** (rutas reales en `api/src/modules/**/*.routes.ts`):

| Grupo | Endpoints |
|---|---|
| Tipos de pago | `GET/POST /tipos-pago`, `GET/PUT/DELETE /tipos-pago/:id` (DELETE = baja lógica: `activo = false`), `PUT /tipos-pago/:id/default` |
| Cuentas recaudadoras | `PUT /cuentas/:id/default` |
| Pagos | `POST /pagos/:id/soporte` (multipart, imagen/PDF, 5 MB, solo `pendiente`), `DELETE /pagos/:id`, `POST /pagos/:id/revertir` |
| Notificaciones | `GET /notificaciones`, `GET /notificaciones/no-leidas`, `PATCH /notificaciones/:id/leida`, `PATCH /notificaciones/leer-todas` |
| Tasa BCV | `GET /tasas-bcv/actual`, `GET /tasas-bcv/historial`, `GET /tasas-bcv/job`, `PUT /tasas-bcv/job`, `POST /tasas-bcv/sincronizar` |
| Catálogo de formulario | `GET /catalogos/form-pago` ahora devuelve también `tiposPago`, `defaults` y `reglas: { bancoOrigenObligatorio }` |
| Archivos | `GET /api/uploads/:filename` (reemplaza el servicio estático público) |

**Job en segundo plano:** `api/src/jobs/bcv-rate.job.ts`. Consulta
`https://api.farmavid.com.ve/api/rates` cada 60 minutos (`setInterval` en proceso), guarda solo
tasas nuevas y **relee `bcv.job_habilitado` en cada ciclo**, por lo que activar/desactivar la
consulta desde la UI (`PUT /tasas-bcv/job`) surte efecto **sin reiniciar**. Un fallo externo se
registra y se descarta; nunca tumba el proceso. Solo se usa el valor `usd`.

**Permisos:** `api/prisma/seed.ts` define **38 claves** (confirmado: la tabla `permisos` tiene 38
filas). Las claves incorporadas en las iteraciones 1–4 son `pagos.eliminar` y
`pagos.revertir_validacion`; la iteración 5 (CR-002, §8) agregó **`pagos.editar`** (de 37 a 38).
Todas se otorgan al rol **Administrador** en el seed (`ALL`). La iteración 7 (§10) sumó
`pagos.editar` y `pagos.revertir_validacion` al rol **Administrativo**, que queda con **19**
permisos (antes 17); el detalle del cambio está en §10.

**Parámetros:** la tabla `parametros` tiene **10 filas**. Los incorporados en este ciclo son:

| Clave | Valor sembrado | Efecto |
|---|---|---|
| `pago.cuenta_recaudadora_default` | `1` (Banca Amiga) | Cuenta preseleccionada al registrar. |
| `pago.tipo_pago_default` | `1` (Pago Móvil) | Tipo de pago preseleccionado. |
| `bcv.job_habilitado` | `1` | Habilita el job horario de la tasa BCV. |
| `pago.banco_origen_obligatorio` | `1` | `1` = banco de origen obligatorio (comportamiento previo); `0` = opcional. |

**Fix de caché:** `invalidateConfigCache()` (en `api/src/lib/config-values.ts`) estaba **muerto**:
la caché de 30 s no se invalidaba al editar un parámetro, así que un cambio tardaba hasta 30 s en
aplicar. Ahora se invoca desde `parametros.service.ts` (update y bulkUpdate), `cuentas.service.ts`,
`tipos-pago.service.ts` y `tasas-bcv.service.ts`, de modo que los cambios aplican de inmediato.

**Auditoría:** `auditar()` en `api/src/lib/audit.ts` aceptó un parámetro opcional `tx`. Con `tx`
**relanza** el error (para abortar la transacción del llamador); sin `tx` conserva el
comportamiento histórico de mejor esfuerzo (nunca rompe la operación).

### 2.3 Frontend

| Componente / pantalla | Cambio |
|---|---|
| `Combobox` (`web/src/components/ui/combobox.tsx`) | Selector con búsqueda insensible a mayúsculas **y acentos** (`NFD` + strip de diacríticos), navegación por teclado (↑/↓/Home/End/Enter/Escape/Tab) y ARIA (`role="combobox"`, `listbox`, `aria-activedescendant`). Se usó para **Banco de origen** en `ReportarPage`. |
| Notificaciones (`NotificationsPanel`) | Campana en el encabezado con contador de no leídas; consulta cada **60 s** (`UNREAD_POLL_MS = 60_000`). Al abrir un aviso de pago redirige a validación o a «Mis pagos» según permisos. |
| Comprobante | `FilePreviewDialog` previsualiza imagen en línea o PDF embebido, con estados de carga, error + reintento y descarga; `obtenerArchivoPrivado` obtiene el archivo como **blob** por el cliente axios compartido. Se eliminaron `resolveUploadUrl` y `UPLOAD_URL`. |
| Modo oscuro (`useTheme`) | Claro por defecto; alterna desde el encabezado, persiste en `localStorage` (`gc.theme`) y un script en línea en `index.html` aplica el tema antes del primer render. |
| Cuenta / tipo por defecto | Configuración → Cuentas y Tipos de pago permiten «fijar como predeterminada/o»; el formulario de pago los preselecciona. |
| Parámetros | Los parámetros booleanos conocidos (`pago.banco_origen_obligatorio`, `bcv.job_habilitado`) se renderizan como **switch** en vez de campo de texto. |
| Atajos validación | `J`/`K` navegan, `Enter` y `A` aprueban el pago activo, `R` rechaza. |
| Eliminar / revertir | Acciones en la bandeja y en «Mis pagos», con confirmación. La bandeja incorpora **filtro por estado** (por defecto, pendientes). |
| Reportes | `REPORT_PAGE_SIZE = 50` con controles conectados al `meta` del servidor; al cambiar filtros o pestaña vuelve a la página 1. |
| Responsive | `DataTable` acepta `mobileCard`; bajo `sm` renderiza tarjetas apiladas. Se usa en **las 27 tablas** (ver §4). |

### 2.4 Documentación y contratos

- `docs/openapi.yaml`: **100 operaciones** (incluye todos los grupos nuevos).
- `docs/postman_collection.json`: **100 peticiones** con login automático.
- Los tres README se actualizaron a medida que cada funcionalidad aterrizó.

---

## 3. Decisiones de diseño y su porqué

Esta es la sección más importante para quien herede el proyecto: explica **por qué** el código es
como es, no solo qué hace.

1. **Borrado físico vs. borrado lógico de pagos.** `DELETE /pagos/:id` es un borrado **duro** y
   solo se permite si el pago **no está `validado`** (si lo está, responde **409** e indica
   revertir primero). Un pago no validado no tiene fila en `conciliaciones` ni `movimiento_banco_id`,
   así que no deja referencias entrantes ni huérfanos. Se descartó el borrado lógico: obligaría a
   filtrar una bandera en **cada** consulta de dashboard y reportes, y un solo punto olvidado
   corrompería los agregados en silencio. La instantánea completa se guarda en la auditoría
   (`datosAntes`).

2. **Revertir la validación es el inverso exacto y va en una transacción.** Libera el movimiento
   bancario a `no_conciliado`; sin ese paso, la regla «un movimiento ↔ un pago» lo dejaría
   bloqueado para siempre. Además elimina la `conciliacion` y limpia `movimientoBancoId`,
   `validadoPor`, `validadoAt` y `motivoRechazo`.

3. **Atomicidad de la auditoría vía `tx`.** Como el borrado es irreversible, la entrada de
   auditoría es el único rastro que sobrevive. Por eso `auditar()` acepta un `tx`: dentro de una
   transacción **relanza** el error, de modo que si no se puede auditar, **no se borra**. Fuera de
   una transacción mantiene el comportamiento de mejor esfuerzo para no romper operaciones.

4. **Columna nullable vs. banco «N/A» ficticio.** `banco_origen_id` se hizo `NULL` en lugar de
   sembrar una fila «N/A» en el catálogo: una fila fantasma contaminaría `bancos` y los filtros de
   reportes, y obligaría a excluirla en cada consulta.

5. **Contrato de normalización `"N/A"`.** La API **nunca** devuelve un nombre de banco nulo en las
   respuestas de pagos: normaliza a `bancoOrigen: { id: null, nombre: "N/A", codigo: "N/A" }`.
   Es una decisión deliberada de contrato: las superficies (web, reportes, exportaciones) reciben
   siempre un string estable y no necesitan un caso especial. La web añade además un `?? 'N/A'`
   defensivo.

6. **Payload sin centinelas.** Cuando el banco de origen es opcional y no se selecciona, el
   formulario **omite** `bancoOrigenId` por completo (no envía `null`, no envía un id falso). El
   esquema Zod lo admite como opcional/nullable, y `PUT` lo trata como actualización parcial: un
   campo ausente conserva el banco; `null` lo limpia. La regla se evalúa sobre el valor resultante.

7. **Blob + previsualización en la app vs. URL firmada vs. pestaña nueva.** El JWT vive en
   `localStorage` y lo adjunta un interceptor de axios, así que un `<a href>` directo **no puede**
   autenticarse. Las URLs firmadas se descartaron porque exponen un token en la URL y en los logs;
   abrir una pestaña nueva se descartó porque los bloqueadores de popups matan la navegación
   posterior a un `await`. La solución es obtener el archivo como **blob** y previsualizarlo en un
   `FilePreviewDialog`. Consecuencia de UX: «Ver comprobante» abre un modal en la app en vez de
   una pestaña del navegador.

8. **Job en proceso vs. programador externo.** El job BCV es un `setInterval` del propio backend,
   no un cron/cola externo: el alcance no justifica infraestructura adicional y permite leer el
   flag de habilitación en **cada tick** (activar/desactivar sin reiniciar).

9. **Polling vs. websockets para notificaciones.** Polling cada 60 s: sin conexión persistente ni
   infraestructura de publicación/suscripción, suficiente para el volumen del sistema.

10. **La tasa BCV vive en su propia tabla (`tasas_bcv`) y es solo informativa.** Es un histórico
    automático, **separado** de `tasas_referencia` (tasa manual contra la que se mide la
    desviación). **Nunca** alimenta la tasa derivada del formulario: la tasa del pago sigue siendo
    siempre `monto_bs / monto_usd`.

11. **Fix de `invalidateConfigCache`.** Ver §2.2: era código muerto y se conectó a las escrituras
    de parámetros para que las ediciones apliquen de inmediato.

12. **Responsive con un solo componente de tabla.** En lugar de duplicar `DataTable`, se le agregó
    un `mobileCard` opcional; así las tarjetas apiladas y la tabla comparten paginación, orden y
    lógica.

---

## 4. Verificación

### 4.1 Lo ejecutado (runtime)

- **Tests unitarios:** `npm test` en `api/` → **57 tests en verde**, 5 archivos
  (`bcv` 10, `classification` 6, `money` 10, `matcher` **17**, `parser` 14). El parser de la
  respuesta BCV (`bcv`) es nuevo en las iteraciones 1–4; los 6 casos extra de `matcher` son de la
  iteración 5 (CR-002, §8.5). Conteo antes de CR-002: 51.
- **Base de datos:** las 4 migraciones están aplicadas y el esquema real coincide con
  `schema.prisma` (por ejemplo `banco_origen_id` es `NULL`-able en `information_schema`).
- **Conteo de endpoints reconciliado:** **100** operaciones = **99** definiciones
  `router.{get,post,put,patch,delete}` repartidas en 20 archivos `*.routes.ts` + `GET /health`
  público (montado en `api/src/app.ts`). Coincide con `openapi.yaml` (100 `operationId`, 100
  métodos) y `postman_collection.json` (100 `request`).
- **`mobileCard`:** **27** usos, exactamente **27** usos de `<DataTable` en 18 archivos → *todas*
  las tablas lo proveen.

### 4.2 Verificado por lectura / inspección

- Rutas, controladores, servicios y esquemas Zod de los módulos nuevos y ampliados.
- `auditar()` (parámetro `tx` y comportamiento de relanzar), `upload.ts` (lista blanca MIME,
  extensión derivada del MIME, límite de 5 MB), `archivos.service.ts` (traversal y autorización),
  `bcv-rate.job.ts` (flag por tick) y `config-values.ts` (caché e invalidación).
- Frontend: `Combobox`, `FilePreviewDialog`, `useTheme`, `Topbar`, `ParametrosTab`,
  `ReportesPage`, `ValidacionPage`.
- READMEs y contratos contra el código.

### 4.3 Matriz de autorización de archivos (`GET /api/uploads/:filename`)

| Archivo referenciado por | Permiso requerido | Resultado |
|---|---|---|
| Comprobante de un pago | `pagos.ver_todos` o `pagos.validar` o ser el cobrador dueño | 200 |
| Soporte de un gasto | `gastos.ver` | 200 |
| Comprobante de un pago, sin permiso | — | 403 |
| Referenciado por ningún registro (huérfano) | — | 404 (no se filtra su existencia) |
| Sin token Bearer | — | 401 |
| Nombre con traversal (`..`, separadores, control) | — | 400 |
| Extensión fuera de la lista blanca | — | 404 |

### 4.4 Evidencia de datos dejada por pruebas manuales

La base contiene filas que indican corridas de verificación previas, no solo el seed:
`pagos_reportados` 59, `movimientos_banco` 59, `conciliaciones` 50, `gastos` 12,
`notificaciones` 11, `tasas_bcv` 1, `bancos` 13, `tipos_pago` 5.

### 4.5 Qué **no** se re-ejecutó en esta pasada

No se volvieron a correr flujos HTTP de punta a punta contra la base viva (aprobación de build,
login y encadenado de peticiones reales). Todo lo anterior es lectura de código, inspección de
esquema/base y la suite de tests unitarios. No existe aún una suite de integración (ver §6).

---

## 5. Limitaciones conocidas

1. **Dos tablas agregadas de reportes no se paginan del lado del servidor.** En **Análisis de
   tasa → Por cobrador** y **Gastos → Por autorizante** las sub-consultas del backend no devuelven
   `meta`, así que muestran su conjunto completo. Las tablas **principales** de cada reporte sí
   paginan (50 filas).
2. **El aviso de validación/rechazo va al cobrador enlazado, no a un «reportado por».** Se
   resuelve por `Cobrador.usuarioId` (`crearParaCobrador`), porque **no existe** un campo «reportado
   por». Consecuencia: si un administrador reporta un pago **en nombre de** un cobrador, la
   notificación de validación/rechazo llega al **cobrador**, no a quien lo reportó.
3. **`docs/schema.sql` no refleja la última migración.** El script SQL del esquema sigue con
   `` `banco_origen_id` INTEGER NOT NULL `` en `pagos_reportados`, mientras que la migración
   `20260920005227_banco_origen_opcional` y la base real lo tienen **nullable**. Es un artefacto
   derivado y debe regenerarse; la fuente de verdad es `schema.prisma` + las migraciones.
4. **Las notificaciones se crean por destinatario y por evento.** Reportar un pago inserta una
   fila por cada usuario activo con `pagos.validar`; un cambio de rol o un alta posterior no
   reciben avisos de eventos pasados.
5. **Los archivos viven en disco local** (`UPLOAD_DIR`); no hay almacenamiento externo ni
   redundancia.

---

## 6. Pendientes / próximos pasos

1. **Tests de integración HTTP.** `supertest` (`^7.0.0`) y `@types/supertest` ya figuran en
   `api/package.json` pero **no se usan**: no hay ninguna suite que ejercite los endpoints de
   punta a punta.
2. **Envío real de correo** para la recuperación de contraseña. Hoy, sin servicio de correo, el
   token se devuelve **solo si `NODE_ENV !== 'production'`**; en producción el flujo no está
   implementado.
3. **Almacenamiento externo** para soportes y comprobantes (objeto/S3), en lugar de disco local.
4. **Limpieza de filas de verificación.** Purgar la auditoría y los refresh tokens generados por
   las corridas de prueba (`auditoria` 127 filas, `refresh_tokens` 91 filas al cierre de este
   registro).
5. **Regenerar `docs/schema.sql`** para que acompañe a la migración de banco de origen opcional.
6. **Evaluar la paginación server-side** de las dos tablas agregadas de reportes (§5.1).

---

## 7. Cómo levantar el proyecto

Requisitos, puesta en marcha, variables de entorno, usuarios de prueba y reglas de negocio están
en el [`README.md`](./README.md) de la raíz. Resumen mínimo:

```powershell
# Base de datos (XAMPP encendido)
& "C:\xampp\mysql\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS gestion_cobros CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Backend
cd api; Copy-Item .env.example .env; npm install; npx prisma migrate deploy; npm run seed; npm run dev

# Frontend (otra terminal)
cd web; Copy-Item .env.example .env; npm install; npm run dev
```

- Backend: `http://localhost:4000` · healthcheck `GET /health`
- Frontend: `http://localhost:5173`
- Documentación de API: [`docs/openapi.yaml`](./docs/openapi.yaml) · Colección Postman:
  [`docs/postman_collection.json`](./docs/postman_collection.json)

---

## 8. Iteración 5 — CR-002: edición de pagos validados y restablecer filtros

Registro **prospectivo** original en [`CAMBIOS-SOLICITADOS.md`](./CAMBIOS-SOLICITADOS.md) (CR-002).
Esta iteración **sí cambió código** (`api/src`, `api/prisma`, `web/src`), a diferencia de lo que ese
documento asumía al redactarse.

### 8.1 Qué pedía el negocio

> «…poder editar pagos ya validados…, desde la bandeja de validación quiero también editar y
> modificar el estado de validación de un pago con el permiso de editar pago…, y un botón que deje
> restablecer el filtro en cada una de las secciones.»

El pedido tenía tres requisitos genuinamente nuevos: **R1** restablecer filtros, **R3** editar los
**datos** de un pago ya `validado` y **R4/R5** una acción de edición en la bandeja con **permiso
propio**. «Revertir la validación» (R2) y la auditoría (R6) ya existían de la iteración 2 y se
reutilizaron.

### 8.2 Backend

- **Permiso nuevo `pagos.editar`** (`api/prisma/seed.ts`): descripción «Editar pagos, incluidos los
  ya validados», concedido al rol **Administrador** vía `ALL`; el rol `Administrativo` **no** lo
  recibe. Total de permisos: **37 → 38** (verificado: `SELECT COUNT(*) FROM permisos` = 38). Los
  permisos se **siembran**, no requieren migración.
- **`editarPago()`** (`api/src/modules/pagos/pagos.service.ts`) reescrito con tres caminos:
  - `pendiente` → idéntico a antes (el cobrador edita los propios; auditoría fuera de transacción).
  - `validado` → exige `pagos.editar` (**403** si falta) y edita **en caliente** dentro de una
    transacción; `rechazado`/`duplicado` → **409**.
- **Re-evaluación del vínculo:** nueva función pura `evaluarVinculoConciliacion()` en
  `api/src/modules/conciliacion/matcher.ts`. Reutiliza `calcularPuntaje()` (no duplica la lógica de
  match) y agrega el invariante de cuenta: `movimiento.cuentaRecaudadoraId === pago.cuentaRecaudadoraId`.
  Devuelve `null` cuando la edición rompe el vínculo (referencia, monto fuera de tolerancia, fecha
  fuera de la ventana o cuenta distinta).
- **Atomicidad:** si el vínculo se mantiene, la transacción actualiza el pago, recalcula
  `conciliaciones.diferenciaBs = montoBs - movimiento.montoBs` y escribe la auditoría
  (`datosAntes`/`datosDespues`, con la diferencia) usando el `tx` de `auditar()`. Si el vínculo se
  rompe, **no se escribe nada** y responde **409** nombrando el movimiento en conflicto.
- **El guard de la ruta NO cambió** (`api/src/modules/pagos/pagos.routes.ts`): `PUT /pagos/:id`
  sigue con `requirePermiso.some('pagos.reportar', 'pagos.ver_todos')`. Reemplazarlo por
  `requirePermiso('pagos.editar')` habría roto la edición que el **cobrador** hace de sus pagos
  `pendiente`; el permiso elevado se exige **dentro del servicio**.
- **0 endpoints nuevos:** las operaciones OpenAPI quedan en **100** y las peticiones Postman en
  **100**.

### 8.3 Frontend

- **`EditarPagoDialog`** (`web/src/features/pagos/EditarPagoDialog.tsx`): diálogo de edición
  extraído de `MisPagosPage` a un componente compartido. Sobre un pago `validado` muestra un aviso
  de que la conciliación se re-evalúa al guardar y que, si se rompe, deberá revertirse primero.
- **`MisPagosPage`**: un usuario con `pagos.editar` ahora ve «Editar» también sobre pagos
  `validado` (`pago.estado === 'pendiente' || (pago.estado === 'validado' && puedeEditarValidado)`).
- **`ValidacionPage`**: acción **«Editar pago»** (permiso `pagos.editar`) sobre pagos `pendiente` y
  `validado`, tanto en la fila/tarjeta como en el panel del pago activo; reutiliza `EditarPagoDialog`.
- **`ClearFiltersButton`** (`web/src/components/common/ClearFiltersButton.tsx`): primitivo
  compartido con un hook `useActiveFilters(current, initial)` que compara por **valor** (firma
  estable, independiente del orden de claves e identidad del objeto) y el botón «Limpiar filtros»,
  **deshabilitado** cuando no hay filtro activo. Adoptado en **14 secciones**: Mis pagos,
  Validación, Movimientos, Gastos, Auditoría, Historial BCV, Reportes y las 7 pestañas de
  Configuración. En todas, limpiar devuelve los filtros a su valor inicial y **reinicia a la
  página 1**.

### 8.4 Decisiones de diseño y su porqué (CR-002)

1. **Editar en caliente vs. exigir revertir primero (D7).** Se eligió editar sin revertir y
   **recalcular** la conciliación en la misma transacción; obligar a revertir → editar → revalidar
   habría multiplicado los pasos para correcciones triviales (p. ej. un `cliente` mal escrito).
2. **Si la edición rompe el match, se bloquea (D9).** **409** con el movimiento en conflicto en
   lugar de desvincular en silencio: dejar un pago `validado` con un vínculo roto corrompería los
   agregados sin señal. La alternativa —soltar el vínculo— cambiaría estado y conciliación sin que
   el validador lo pida.
3. **Permiso propio `pagos.editar` (D8) en vez de reutilizar `pagos.revertir_validacion`.** El
   pedido habla del «mismo permiso de edición»; separar edición de reversión permite conceder una
   sin la otra.
4. **El guard de la ruta se mantiene permisivo.** El permiso elevado se verifica en el servicio
   porque la edición de un `pendiente` por el cobrador no debe exigirlo.
5. **Primitivo compartido de filtros (D5).** Con 14 secciones, 14 botones copiados se
   desincronizan y el próximo filtro que se agregue se olvida; un solo primitivo concentra el
   comportamiento (`disabled` por valor) y el estilo.

### 8.5 Verificación

- **Tests unitarios:** `npm test` en `api/` → **57 tests en verde** (5 archivos). `matcher.test.ts`
  pasó de 11 a **17** casos: 6 nuevos para `evaluarVinculoConciliacion` (2 que conservan el vínculo
  y 4 que lo bloquean: monto fuera de tolerancia, referencia distinta, fecha fuera de la ventana y
  cuenta recaudadora distinta).
- **Base de datos:** `SELECT COUNT(*) FROM gestion_cobros.permisos` → **38** (antes 37).
- **Contratos:** `docs/openapi.yaml` → **100** operaciones; `docs/postman_collection.json` → **100**
  peticiones. Sin endpoints nuevos.
- **Frontend:** `ClearFiltersButton` importado/instanciado en **14** archivos de `web/src`.
- Verificado por **lectura de código** (`pagos.service.ts`, `pagos.routes.ts`, `matcher.ts`,
  `seed.ts`, `EditarPagoDialog.tsx`, `ValidacionPage.tsx`, `MisPagosPage.tsx`,
  `ClearFiltersButton.tsx`) y por consulta directa a la base; no se re-ejecutaron flujos HTTP de
  punta a punta (sigue sin haber suite de integración, ver §6.1).

### 8.6 Limitaciones de esta iteración

- **Solo se editan los campos que expone el diálogo** (`referencia`, `montoBs`, `montoUsd`,
  `cliente`, `concepto`). A nivel de servicio el `PUT` admite más campos (`cuentaRecaudadoraId`,
  `fechaPago`, etc.), pero la UI no los ofrece todavía.
- **El diálogo de edición no permite cambiar el `estado`** del pago; el cambio de estado sigue por
  las acciones de validar/rechazar/revertir/marcar duplicado.
- La detección del vínculo roto depende de los parámetros vigentes (`match.amount_tolerance_bs`,
  `match.date_window_days`, `match.reference_suffix`): editar con una configuración distinta a la
  del momento de validar puede bloquear una corrección legítima. Es deliberado (el vínculo se juzga
  con las reglas actuales).

### 8.7 Archivos de esta iteración

- `api/prisma/seed.ts` — permiso `pagos.editar` (38 total).
- `api/src/modules/pagos/pagos.service.ts` — `editarPago()` con edición de validados.
- `api/src/modules/conciliacion/matcher.ts` — `evaluarVinculoConciliacion()`.
- `api/src/modules/conciliacion/...` — `matcher.test.ts` +6 casos.
- `web/src/components/common/ClearFiltersButton.tsx` — primitivo de reset (nuevo).
- `web/src/features/pagos/EditarPagoDialog.tsx` — diálogo de edición compartido (nuevo).
- `web/src/features/pagos/MisPagosPage.tsx`, `web/src/features/validacion/ValidacionPage.tsx` y 12
  secciones más de `web/src` — adopción de edición/limpiar filtros.
- `docs/openapi.yaml`, `docs/postman_collection.json`, los tres README y este CHANGELOG —
  sincronización de la documentación (esta iteración documental).

---

## 9. Iteración 6 — CR-001: referencia parcial (piso de 4 dígitos) y duplicados a validación manual

Registro **prospectivo** original en [`CAMBIOS-SOLICITADOS.md`](./CAMBIOS-SOLICITADOS.md) (CR-001).
Esta iteración **sí cambió código** (`api/src`, `web/src`), a diferencia de lo que ese documento
asumía al redactarse. **No** hubo esquema, migración ni estado nuevos.

### 9.1 Qué pedía el negocio

> «…si los cobradores colocan ya sea la referencia completa o los últimos 4 dígitos…, siempre y
> cuando coincidan tanto los últimos 4 dígitos como el monto en Bs. Y si este pago indica que está
> duplicado, quiero que quede pendiente por validar y sea la persona que se encarga de validar los
> pagos quien realice la validación manual.»

Tres requisitos: **R1** referencia completa **o** 4 dígitos, **R2** referencia **y** monto, y
**R3** —el corazón— un duplicado **no** se cierra automáticamente: queda `pendiente` para
validación manual.

### 9.2 Backend

- **Contraste por referencia con piso** (`api/src/modules/conciliacion/matcher.ts`).
  `normalizarReferencia()` reduce a dígitos; `sufijoReferencia()` toma el último
  `match.reference_suffix` (**8**) o la referencia completa si es más corta; `MIN_DIGITOS_CONTRASTE
  = 4` es el piso: una referencia con menos de 4 dígitos **no** matchea por sufijo, solo por
  igualdad exacta. `referenciasCoinciden()` compara en doble sentido
  (`db.endsWith(sa) || da.endsWith(sb) || sa === sb`).
- **Duplicado** (`buscarDuplicado` + `coincideReferenciaMonto`). Un pago es duplicado cuando
  coincide por referencia (misma regla) **y** monto en Bs dentro de `match.amount_tolerance_bs`
  con un movimiento **ya conciliado con otro pago**, en la **misma cuenta recaudadora**. La
  **ventana de fecha se excluye a propósito**: el reporte duplicado suele traer una fecha
  equivocada, y esa fecha es el origen del duplicado.
- **`validarPago()` bloquea la vía automática.** Sin `movimientoBancoId`, si hay duplicado lanza
  **409** y no valida; el pago permanece `pendiente`. Con `movimientoBancoId` (vía manual) sigue
  funcionando igual.
- **`validarLote()` reporta duplicados** dentro del array `errores` existente (motivo con «posible
  duplicado») y no los valida; usa el `tx` de la transacción para ver los movimientos ya
  conciliados dentro del mismo lote.
- **`obtenerCoincidencias()` devuelve `{ coincidencias, duplicado }`**; el controlador
  (`api/src/modules/pagos/pagos.controller.ts`) responde `{ data, duplicado }`, conservando la
  forma original del array `data`.
- **Sin estado, sin migración.** El duplicado se **calcula al vuelo**; no hay columna, estado ni
  migración nuevos.
- **0 endpoints nuevos:** OpenAPI queda en **100** operaciones y Postman en **100** peticiones.

### 9.3 Frontend

- **Tipos `DuplicadoInfo` / `CoincidenciasResultado`** (`web/src/types/index.ts`) y
  `getCoincidencias()` devolviendo `{ data, duplicado }` (`web/src/api/pagos.ts`).
- **`DuplicadoAviso`** (`web/src/features/validacion/ValidacionPage.tsx`): aviso prominente
  («Posible duplicado», `role="alert"`) con la referencia y el monto del movimiento y el id del
  pago con el que ya está conciliado.
- **Intercepción de la vía automática:** `validarAutomatico()` y `aprobarActivo()` —y por tanto el
  botón «Validar» y los atajos `Enter`/`A`— no disparan la petición si hay duplicado; muestran un
  aviso y guían a la validación manual («Validar con este movimiento»). La validación en lote
  muestra el conteo de duplicados entre los errores.

### 9.4 Decisiones (resueltas por defecto)

- **D1 — qué es un duplicado.** RESUELTA: «el movimiento bancario ya está conciliado con otro
  pago». Se descartan (diferidos) el doble reporte del mismo cobrador y el cruce entre cobradores.
- **D2 — monto exacto vs. tolerancia.** **Por defecto: se mantiene la tolerancia
  `match.amount_tolerance_bs = 0.01`** (verificado en la base). El dueño del producto puede
  cambiarla a comparación exacta si lo pide.
- **D3 — ¿sobrevive la validación automática?** **Por defecto: SÍ** para una coincidencia única y
  no duplicada; solo los duplicados dejan de cerrarse automáticamente. Overridable por el negocio.
- **D4 — ¿se persiste la señal?** **Por defecto: se calcula al vuelo**, sin persistencia,
  migración ni estado nuevo. Overridable por el negocio (exigiría columna/estado + migración).
- Todas son decisiones **tomadas por defecto** por el equipo técnico; el dueño del producto puede
  revisarlas.

### 9.5 Verificación

- **Tests unitarios:** `npm test` en `api/` → **71 tests en verde** (6 archivos).
  `matcher.test.ts` pasó de 17 a **27** casos (10 nuevos: normalización, piso de 4 dígitos y
  `coincideReferenciaMonto` sin ventana de fecha).
- **Base de datos:** `match.amount_tolerance_bs = 0.01`, `match.date_window_days = 3`,
  `match.reference_suffix = 8` (sin cambios).
- **Contratos:** `docs/openapi.yaml` → **100** operaciones; `docs/postman_collection.json` → **100**
  peticiones. Sin endpoints nuevos.
- **Smoke test en vivo** (API en `:4000`, pago 2 = ref `12345678`, Bs 3600, cuenta 1):
  `GET /api/pagos/2/coincidencias` devuelve `duplicado` apuntando al movimiento **1** (ya
  conciliado con el pago 1) con `data = []`, y `POST /api/pagos/2/validar` con cuerpo vacío
  responde **409** sin cambiar el pago.
- Verificado por **lectura de código** (`matcher.ts`, `conciliacion.service.ts`,
  `pagos.controller.ts`, `matcher.test.ts`, `ValidacionPage.tsx`, `types/index.ts`, `api/pagos.ts`)
  y por consulta directa a la base.

### 9.6 Limitaciones de esta iteración

- El contraste de referencia usa el último `match.reference_suffix` (**8**) **de la referencia
  reportada**, no siempre 4 dígitos. Reportar la referencia completa y reportar solo sus últimos 4
  dígitos **no** garantiza el mismo conjunto de candidatos: una referencia más corta amplía el
  predicado de sufijo. Lo que sí se cumple es que **ambas formas pueden matchear** el mismo
  movimiento (por igualdad exacta la primera, por sufijo la segunda, siempre con ≥ 4 dígitos).
- La detección de duplicado solo mira movimientos **ya conciliados**; no detecta el doble reporte
  de una misma transacción cuando todavía no está conciliada (fuera de alcance por D1).

### 9.7 Archivos de esta iteración

- `api/src/modules/conciliacion/matcher.ts` — `MIN_DIGITOS_CONTRASTE`, `normalizarReferencia`,
  `sufijoReferencia`/`referenciasCoinciden` con piso de 4, `coincideReferenciaMonto`,
  `buscarDuplicado`.
- `api/src/modules/conciliacion/conciliacion.service.ts` — `obtenerCoincidencias` devuelve
  `{ coincidencias, duplicado }`; `validarPago` y `validarLote` bloquean/reportan duplicados.
- `api/src/modules/pagos/pagos.controller.ts` — `coincidencias` responde `{ data, duplicado }`.
- `api/tests/matcher.test.ts` — +10 casos del CR-001.
- `web/src/types/index.ts`, `web/src/api/pagos.ts`,
  `web/src/features/validacion/ValidacionPage.tsx` — consumo y aviso de duplicado.
- `docs/openapi.yaml`, `docs/postman_collection.json`, los tres README, `CAMBIOS-SOLICITADOS.md` y
  este CHANGELOG — sincronización documental.

---

## 10. Iteración 7 — Endurecimiento de seguridad y correctitud (auditoría de CR-002)

Ronda de endurecimiento posterior a CR-001/CR-002, **sin funcionalidad de producto nueva**: cierra
hallazgos de autorización, de permisos sembrados, de validación de montos y de dependencias.
**0 endpoints nuevos** (OpenAPI sigue en **100** operaciones, Postman en **100** peticiones) y
**71 tests** sin cambios (no se agregaron casos en esta ronda).

### 10.1 Qué se corrigió

1. **`Consultor` estrictamente de solo lectura.** En `api/src/modules/pagos/pagos.routes.ts` las dos
   rutas de escritura dejaron de exigir `pagos.ver_todos` (permiso de **LECTURA**) y pasaron a
   exigir `requirePermiso.some('pagos.reportar','pagos.editar')`:
   - `PUT /pagos/{id}` (antes `some('pagos.reportar','pagos.ver_todos')`);
   - `POST /pagos/{id}/soporte` (antes `some('pagos.reportar','pagos.ver_todos')`).
   Las dos rutas GET que legítimamente usan `some('pagos.ver_todos','pagos.ver_propios')` **no**
   cambiaron. `pagos.ver_todos` ya **no** concede escritura en ningún punto. El servicio
   (`editarPago`, `pagos.service.ts`) sigue exigiendo `pagos.editar` para editar un pago `validado`.
2. **Brecha de permisos de `Administrativo`.** En `api/prisma/seed.ts` el rol `Administrativo` ganó
   `pagos.editar` y `pagos.revertir_validacion`: pasa a **19** permisos. `Consultor` queda igual en
   **10** (conserva `pagos.ver_todos`, sin `pagos.editar`). `Administrador` **38** (todos),
   `Cobrador` **3**; el catálogo total sigue en **38** claves.
3. **Monto inválido en pagos → 400, no 500.** El helper compartido `decimalString` de
   `api/src/modules/pagos/pagos.schema.ts` rechaza valores no numéricos y no positivos con el
   mensaje `El monto debe ser un numero positivo`; aplica a `reportarPagoSchema` y a
   `editarPagoSchema` (`montoBs`/`montoUsd`). Antes un valor no numérico o `<= 0` llegaba a
   `calcularTasa()` y afloraba como **500**.
4. **`xlsx` remediado (CVE-2023-30533 y CVE-2024-22363).** `api/package.json` pasó de `^0.18.5` a la
   compilación parcheada publicada por SheetJS `0.20.3`
   (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, confirmado en `package-lock.json`). El
   consumidor es `api/src/modules/importacion/parser.ts` (importa `* as XLSX from 'xlsx'` y acepta
   `.xlsx`/`.csv`).
5. **Gate de edición del frontend alineado.** En `web/src/features/pagos/MisPagosPage.tsx` un pago
   `pendiente` es editable con `pagos.reportar` **o** `pagos.editar`; un pago `validado` solo con
   `pagos.editar` (helper `puedeEditarPago`). La bandeja de validación (`ValidacionPage`) mantiene
   su gate propio: editar requiere `pagos.editar`.

### 10.2 Verificación

- **Tests unitarios:** `npm test` en `api/` → **71 tests en verde** (6 archivos), sin cambios.
- **Base de datos (SQL):** Administrador **38**, Administrativo **19**, Cobrador **3**, Consultor
  **10**; tabla `permisos` **38**.
- **Contratos:** `docs/openapi.yaml` → **100** operaciones; `docs/postman_collection.json` → **100**
  peticiones. Sin endpoints nuevos.
- **Gastos (prueba dirigida):** `crear()` con `montoBs = 0` o `montoUsd = 0` responde **400**
  (`El monto en Bs debe ser mayor a 0` / `El monto en USD debe ser mayor a 0`), no 500.

### 10.3 Inconsistencia conocida (no corregida)

- **Dos helpers de dinero distintos.** `pagos.schema.ts` endureció `decimalString` (positivo
  estricto), pero `gastos.schema.ts` conserva su helper `monto` (regex que permite `0`) y su propio
  mensaje. **No** produce un 500: `gastos.service.ts` envuelve `calcularTasa` en `try/catch` y lo
  traduce a **400** (verificado ejecutando `crear()` con montos en cero). Queda como deuda de
  consistencia: unificar ambos helpers (mismo regex y mismo mensaje) para que el rechazo ocurra en
  el esquema y no en el servicio. Fuera del alcance de esta ronda.

### 10.4 Archivos de esta iteración

- `api/src/modules/pagos/pagos.routes.ts` — guard de escritura `some('pagos.reportar','pagos.editar')`.
- `api/prisma/seed.ts` — `Administrativo` con `pagos.editar` y `pagos.revertir_validacion` (19).
- `api/src/modules/pagos/pagos.schema.ts` — `decimalString` estricto.
- `api/package.json` — `xlsx` `0.20.3` desde el CDN de SheetJS.
- `web/src/features/pagos/MisPagosPage.tsx` — gate `puedeEditarPago`.
- `docs/openapi.yaml`, `docs/postman_collection.json`, los tres README, `CAMBIOS-SOLICITADOS.md` y
  este CHANGELOG — sincronización documental.

---

## 11. Iteración 8 — Plantilla descargable para la importación bancaria (CR-003)

A diferencia de las iteraciones 6 y 7, esta **sí agrega un endpoint**, así que **los conteos de
contrato cambian**: OpenAPI **100 → 101** operaciones y Postman **100 → 101** peticiones. Registro
prospectivo original en [`CAMBIOS-SOLICITADOS.md`](./CAMBIOS-SOLICITADOS.md) (CR-003).

### 11.1 Qué se solicitó

> «Que en el proceso de importación bancaria se pueda descargar una plantilla Excel para que los
> usuarios carguen el archivo en el formato correcto.»

Un solo requisito funcional: **ofrecer una plantilla `.xlsx` descargable** con el formato que espera
el importador, con **una fila de ejemplo** que sirva de guía y que el usuario reemplace o elimine.

### 11.2 Backend

- **Endpoint nuevo** `GET /api/importacion/plantilla`
  (`api/src/modules/importacion/importacion.routes.ts`), protegido con
  `requirePermiso('movimientos.importar')`. El handler `plantilla`
  (`importacion.controller.ts`) fija `Content-Type`
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y
  `Content-Disposition: attachment; filename="plantilla-importacion-bancaria.xlsx"`.
- **Generación** `generarPlantilla()` (`importacion.service.ts`) con **ExcelJS** (sin dependencias
  nuevas): un workbook con una única hoja `Movimientos`; la fila 1 es el encabezado en **negrita**
  (`Referencia` | `Monto en Bs` | `Fecha de ejecución`) y la fila 2 es **una única fila de ejemplo**
  (`EJEMPLO-0000` | `0,01` | `01/01/2000`). El ejemplo es válido para el parser, de modo que la
  plantilla sin modificar no produce errores de detección.
- **Sin persistencia, sin migración.** El endpoint solo construye el archivo en memoria (mismo
  patrón que las exportaciones de `reportes`: buffer en el servicio, cabeceras en el controlador).

### 11.3 Frontend

- `descargarPlantillaImportacion()` (`web/src/api/importacion.ts`) descarga el archivo con el helper
  compartido `downloadFile()` (`web/src/api/client.ts`), que adjunta el `Bearer` y respeta el nombre
  del `Content-Disposition`.
- Botón **«Descargar plantilla»** en la tarjeta «Cargar archivo» de
  `web/src/features/importacion/ImportacionPage.tsx`, junto con un aviso de que la **fila de ejemplo
  debe reemplazarse o eliminarse** antes de importar, **porque los movimientos importados no se
  pueden eliminar** desde la aplicación (el módulo `movimientos` solo expone lectura).

### 11.4 Verificación

- **Tests unitarios:** `npm test` en `api/` → **71 tests en verde** (sin cambios; el endpoint no
  agrega casos unitarios).
- **Contratos:** `docs/openapi.yaml` → **101** operaciones; `docs/postman_collection.json` → **101**
  peticiones. Reconciliación: **101** = **100** definiciones
  `router.{get,post,put,patch,delete}` en 20 archivos `*.routes.ts` + `GET /health` público.
- **Round-trip en vivo** (API en `:4000`, `admin` / `Admin123!`):
  `GET /api/importacion/plantilla` responde **200** con `Content-Type` xlsx y
  `Content-Disposition: attachment; filename="plantilla-importacion-bancaria.xlsx"` (6628 bytes); el
  archivo reenviado a
  `POST /api/importacion/preview?cuentaRecaudadoraId=1&primeraFilaEsEncabezado=true` devuelve
  `{"filasTotales":1,"erroresDeteccion":0,...}`. Un usuario sin el permiso (`consultor`) recibe
  **403**; sin token, **401**.
- **Contenido del workbook** (leído con ExcelJS desde el archivo descargado): hoja `Movimientos`,
  fila 1 en negrita `["Referencia","Monto en Bs","Fecha de ejecución"]`, fila 2
  `["EJEMPLO-0000","0,01","01/01/2000"]`, `rowCount = 2` (ninguna fila extra).

### 11.5 Archivos de esta iteración

- `api/src/modules/importacion/importacion.routes.ts` — `GET /plantilla` con
  `requirePermiso('movimientos.importar')`.
- `api/src/modules/importacion/importacion.controller.ts` — handler `plantilla` (cabeceras + buffer).
- `api/src/modules/importacion/importacion.service.ts` — `generarPlantilla()` (ExcelJS).
- `web/src/api/importacion.ts` — `descargarPlantillaImportacion()`.
- `web/src/features/importacion/ImportacionPage.tsx` — botón «Descargar plantilla» + aviso.
- `docs/openapi.yaml`, `docs/postman_collection.json`, los tres README, `CAMBIOS-SOLICITADOS.md` y
  este CHANGELOG — sincronización documental.

---

## 12. Sincronización usuario ↔ cobrador (corrección en producción)

Falla reportada: «cuando activo los cobradores, como usuario admin no puedo ver los cobradores
activos desde el formulario de registrar pagos».

### 12.1 Diagnóstico (verificado en código, en el bundle desplegado y en la base)

| Verificación | Resultado |
|---|---|
| El campo «Cobrador (reportar a nombre de)» existe y está desplegado | El bundle que sirve el propio API (`ReportarPage-*.js`) contiene la condición `pagos.ver_todos` y la opción «Yo mismo»: es idéntico a `web/src/features/pagos/ReportarPage.tsx`. |
| Permiso del administrador | El rol `Administrador` tiene `pagos.ver_todos` y `cobradores.ver` (38 permisos). El campo **sí** se renderiza para el admin. |
| Endpoint | `GET /api/cobradores?pageSize=200&activo=true` con sesión de admin responde **200** y devuelve los 2 cobradores activos existentes. |

**Causa raíz (no era un bug de permisos):** en el sistema un cobrador **no** es un usuario con el rol
`Cobrador`. Es una fila de la tabla `cobradores` (con su propio `codigo`) que **se vincula** a un
usuario, y el formulario de pago solo puede ofrecer filas que existan. La operación del negocio fue
crear y activar usuarios con el rol `Cobrador` desde Configuración → Usuarios; esos usuarios **no**
tenían fila de cobrador, así que no aparecían. En la base auditada: **4** usuarios con rol `Cobrador`
pero solo **2** filas en `cobradores`.

### 12.2 Delta

Sincronización automática entre ambos conceptos (`api/src/lib/cobrador-sync.ts`):

- Un usuario con rol `Cobrador` **siempre** tiene fila de cobrador vinculada.
- La fila **refleja** el `nombreCompleto` y el `activo` del usuario.
- Si el usuario deja de ser cobrador (cambio de rol, desactivación o baja lógica), la fila se
  **desactiva**, nunca se borra: los pagos ya reportados conservan su referencia.
- El `codigo` se deriva del nombre de usuario (sin acentos, en mayúsculas, separadores normalizados,
  tope de 40 caracteres) y la unicidad se resuelve contra la base con sufijo `-2`, `-3`…

### 12.3 Puntos de enganche

| Dónde | Qué hace |
|---|---|
| `usuarios.service.ts` `create` / `update` / `remove` | Llama a la sincronización después de auditar. Es **best-effort**: un fallo al provisionar el cobrador **nunca** falla la escritura del usuario. |
| `index.ts` (arranque) | `repararCobradoresFaltantes()` repara los datos previos: crea la fila que falte para cada usuario con rol `Cobrador`. Es **idempotente y estrictamente aditiva** (no toca cobradores existentes) y un fallo no impide arrancar la API. |

> **Sin migración y sin endpoints nuevos:** OpenAPI sigue en **101** operaciones y Postman en **101**
> peticiones. La reparación inicial corre en el arranque, junto a `prisma migrate deploy`.

### 12.4 Verificación

- **Tests unitarios:** `npm test` en `api/` → **83 tests en verde** (antes 77): se agregó
  `api/tests/cobrador-sync.test.ts` con 6 casos sobre `codigoBaseDesdeUsuario`.
- **Compilación:** `npm run build` (`tsc`) sin errores.
- **Verificación contra la base de producción, con rollback:** la sincronización completa se ejecutó
  dentro de una transacción que termina en `throw`, de modo que **no se persistió nada** (`cobradores`
  seguía en 2 antes y después). Dentro de la transacción, `repararCobradoresFaltantes()` habría creado
  **2** cobradores (los usuarios que no tenían fila) y `provisionarCobradorDeUsuario()` aplicado dos
  veces sobre el mismo usuario **no** duplicó ni alteró filas.

### 12.5 Archivos de esta corrección

- `api/src/lib/cobrador-sync.ts` — módulo nuevo (sincronización + reparación de arranque).
- `api/src/modules/usuarios/usuarios.service.ts` — enganches en `create` / `update` / `remove`.
- `api/src/index.ts` — reparación idempotente en el arranque.
- `api/tests/cobrador-sync.test.ts` — tests unitarios del generador de códigos.
- `CHANGELOG.md` — esta entrada.

### 12.6 El cobrador ve su propio cobrador (solo lectura)

Regla de negocio confirmada por el dueño del proceso: **solo el usuario con `pagos.ver_todos` ve
todos los cobradores** y puede registrar a nombre de otro; **un cobrador solo puede reportar a su
propio nombre**.

Verificación en vivo (solo lecturas contra producción): el rol `Cobrador` tiene exactamente
`tasas.ver`, `pagos.reportar` y `pagos.ver_propios`; `GET /api/cobradores` le responde **403**
(`Permisos insuficientes: cobradores.ver`) y `GET /api/pagos` aplica aislamiento por su `cobradorId`.
En `reportarPago()` el `cobradorId` enviado solo se acepta si el usuario tiene `pagos.ver_todos`; en
cualquier otro caso el backend **fuerza** el cobrador del propio usuario. Es decir: el aislamiento ya
estaba garantizado en el servidor y no dependía del formulario.

Lo que **faltaba** era visibilidad: `ReportarPage` ocultaba el campo por completo cuando el usuario no
tenía `pagos.ver_todos`, así que el cobrador no tenía forma de saber bajo qué nombre quedaba su pago.

- **API:** `AuthUser` (`api/src/middleware/auth.ts`) expone `cobrador: { id, codigo, nombre } | null`
  en `/auth/login`, `/auth/refresh` y `/auth/me`. La fila ya se cargaba en `loadAuthUser`, así que no
  agrega consultas. `cobradorId` se conserva por compatibilidad.
- **UI:** `web/src/features/pagos/ReportarPage.tsx` — con `pagos.ver_todos` se mantiene el selector
  con todos los cobradores activos más la opción «Yo mismo»; sin ese permiso se muestra el cobrador
  propio en **solo lectura** (no editable), con un aviso cuando el usuario no tiene cobrador asignado.
- **Contratos:** `docs/openapi.yaml` — esquema `AuthUser` y ejemplos de `/auth/login` y `/auth/me`.
  **Sin endpoints nuevos:** OpenAPI sigue en **101** operaciones y Postman en **101** peticiones.
- **Archivos:** `api/src/middleware/auth.ts`, `web/src/types/index.ts`,
  `web/src/features/pagos/ReportarPage.tsx`, `docs/openapi.yaml`, `CHANGELOG.md`.

---

## 13. Iteración 9 — Antigüedad de pagos, alerta de «documento viejo», baja definitiva y correcciones de UX

> **Cálculo SUPERADO por §14 (CR-005).** Varias afirmaciones de esta iteración quedan **sin efecto**:
> (1) la **base del cálculo**, que aquí es la antigüedad en días **desde hoy**, pasa a ser la brecha
> entre la `fechaPago` reportada y la `fechaEjecucion` del **movimiento bancario vinculado**,
> persistida al validar; (2) el **comparador**, aquí **estricto** (`>`, con el borde "antigüedad
> menor a N"), pasa a ser `>=` ("N días o más = viejo"); (3) la **alerta de «documento viejo»**
> (`alertaAntiguedadDocumento` / `alertaAntiguedadDias`, con el permiso
> `pagos.ver_alerta_antiguedad`) queda **retirada** de la API, del contrato y de la UI; y (4) el
> **filtro `antiguedadMaxDias`**, aquí medido contra hoy, se **realinea contra el movimiento**
> (`DATEDIFF(fecha_pago, fecha_ejecucion) < N`), excluyendo a los pagos sin movimiento. El umbral de
> referencia ya no es "30 días por defecto contra hoy" sino el **`1`** configurado por el dueño. Se
> conserva esta sección como **historia de la decisión**; los detalles vigentes están en §14.

Lote de **11 commits** (`bdb671b`…`8436d1b`) agrupado en cuatro frentes: reportes por antigüedad,
alerta de «documento viejo» (pago viejo contra movimiento bancario reciente), baja definitiva con
permiso propio y correcciones de UX. A diferencia de las iteraciones 6, 7 y 8, esta **sí agrega
endpoints**: OpenAPI **101 → 103** operaciones y Postman **101 → 103** peticiones. Además suma
**3 permisos** (**38 → 41**) y **4 migraciones de datos** (permisos y catálogo de parámetros),
**sin** cambios de esquema. Registro prospectivo original en
[`CAMBIOS-SOLICITADOS.md`](./CAMBIOS-SOLICITADOS.md) (CR-004).

### 13.1 Reportes

- **Fecha de ejecución del movimiento bancario + filtro por ella** (`bd609fe`). El reporte `cobros`
  ahora expone `fechaMovimiento` por fila y acepta `fechaMovimientoDesde`/`fechaMovimientoHasta`
  (`api/src/modules/reportes/reportes.schema.ts`, `reportes.controller.ts`,
  `reportes.service.ts`). El filtro es **opt-in**: solo lo aplica `cobros`
  (`wherePagosPrisma(f, { conFechaMovimiento: true })`), para no vaciar `pendientes` ni
  `pagos-sin-respaldo` y para no filtrar ingresos contra gastos sin filtrar en `flujo-caja`.
- **Totales de no conciliados y fix del filtro de cobrador** (`65e2525`).
  `movimientosNoConciliados()` devuelve un objeto aditivo `totales: { cantidad, totalBs }`, agregado
  con el **mismo** `where` que las filas paginadas; la pestaña lo muestra en una tarjeta de resumen.
  En paralelo, el filtro de cobrador de reportes pasó a pedir **solo activos**
  (`listarCobradores({ pageSize: 200, activo: true })`) y a descartar los cobradores con `nombre`
  vacío (era el único selector de cobradores que no filtraba por `activo`).
- **Filtro por antigüedad** (`e29ed6c`). Nuevo `antiguedadMaxDias` (entero positivo) que conserva
  los pagos cuya antigüedad, contada en **días completos desde hoy**, es **menor** a N; el borde es
  **estricto** (un pago de exactamente N días queda excluido). Aplica solo a `cobros`, por el mismo
  camino opt-in.
- **Antigüedad en días + marca «Viejo»** (`8436d1b`). `antiguedadEnDias()` y `esPagoViejo()`
  (`api/src/lib/classification.ts`) alimentan `camposAntiguedad()` en `reportes.service.ts`, que
  emite `antiguedadDias` (firmado: hoy = 0, fecha futura negativa) y `esViejo`
  (`antiguedadDias > cobro.umbral_antiguedad_dias`, estricto). Se calculan **al vuelo** con el umbral
  vigente: sin columna, sin job y sin migración. La exportación suma las columnas «Antigüedad» y
  «Viejo».

### 13.2 Pagos / conciliación

- **Alerta de «documento viejo» con permiso propio** (`c952d28`). `alertaAntiguedadDocumento()`
  (`classification.ts`) devuelve los días completos entre `fechaPago` y la `fechaEjecucion` del
  movimiento bancario vinculado cuando la diferencia **supera** `cobro.umbral_antiguedad_dias`, o
  `null` si no aplica. `serializePago()` (`api/src/modules/pagos/pagos.service.ts`) emite
  `alertaAntiguedadDias` **siempre** (null cuando el usuario no tiene
  `pagos.ver_alerta_antiguedad`), resolviendo la configuración **una vez por request**. El límite es
  **de servidor** (`puedeVerAlertaAntiguedad(user)`), no del frontend. El badge se muestra en Mis
  pagos, Validación y la pestaña Cobros de reportes (`web/src/features/pagos/pago-utils.tsx`).
- **Edición de la fecha de pago** (`ff4b30c`). `EditarPagoDialog.tsx` agrega un input `type="date"`
  sembrado desde la **parte UTC** del `DATE` (`fechaPagoInput()`), envía `fechaPago` siempre y
  deshabilita «Guardar cambios» si está vacío.
- **`58eeb44` es un refinamiento de CR-001, no una funcionalidad nueva.** CR-001 (§9) fijó el piso de
  contraste en **4 dígitos** (`MIN_DIGITOS_CONTRASTE`) pero dejó `match.reference_suffix` en **8**;
  este commit baja el sufijo configurado a **4** en `api/prisma/seed.ts` y `MATCH_REFERENCE_SUFFIX`
  (`api/src/config/env.ts`) y lo aplica a producción con una migración. **No** se re-documenta CR-001.

### 13.3 Seguridad / datos

- **Baja definitiva con permiso propio para usuarios y cobradores** (`f2bd31b`). Dos endpoints
  nuevos, `DELETE /api/usuarios/{id}/definitivo` (`requirePermiso('usuarios.eliminar_definitivo')`)
  y `DELETE /api/cobradores/{id}/definitivo` (`requirePermiso('cobradores.eliminar_definitivo')`),
  más diálogos destructivos en `UsuariosTab.tsx` y `CobradoresTab.tsx`. `removeDefinitivo()`
  (`usuarios.service.ts`) cuenta bloqueos (`gastos`, `conciliaciones`, lotes de importación, pagos
  validados y pagos del cobrador vinculado), rechaza con **409** detallando el bloqueo y con **400**
  el auto-borrado; un usuario con cobrador vinculado **sin pagos** se borra junto con él. Todo el
  conteo, el borrado y la auditoría (`accion: 'borrar_definitivo'`) corren en **una transacción**,
  con la violación de FK concurrente (`P2003`) traducida a **409**. `cobradores.service.ts` aplica la
  misma forma y rechaza **409** si el cobrador tiene pagos reportados. Nuevos permisos:
  `usuarios.eliminar_definitivo` y `cobradores.eliminar_definitivo` (**Administrador**).
- **`316b848` es housekeeping documental.** Corrige un comentario de FK en
  `usuarios.service.ts`: `pagos_reportados.validado_por` es `SET NULL` y **nunca** dispara una
  violación; la carrera residual la causan las dependencias `RESTRICT` que la base revalida. Una
  línea, sin cambio de comportamiento.

### 13.4 UX / infra

- **Buscador de cobrador con memoria del último usado** (`bdb671b`).
  `web/src/features/pagos/ReportarPage.tsx` reemplaza el `Select` por `Combobox` (filtra por código o
  nombre) y persiste el último cobrador por usuario en `localStorage`
  (`gentioncobros:ultimoCobrador:<userId>`), preseleccionándolo en el siguiente registro. La lectura
  decae en silencio si `localStorage` no está disponible.
- **Fix del corrimiento de un día en columnas `DATE`** (`441a7f2`). `parseCalendarDate()`
  (`web/src/lib/format.ts`) extrae la parte de fecha y la ancla a medianoche **local**, de modo que
  una columna `DATE` (serializada como medianoche UTC) no se corre un día en offsets UTC negativos.
  `MovimientosPage.tsx` deja de pasar un instante real (`createdAt`) a `formatDate` y usa
  `formatDateTime` con la etiqueta «Fecha de importación».
- **Addendum — `PasswordInput` (commit `d332d2c`, inmediatamente anterior al rango).** Este commit,
  previo a `bdb671b` y también sin documentar, introduce
  `web/src/components/ui/password-input.tsx` con alternancia mostrar/ocultar, adoptado en
  `LoginPage.tsx`, `ResetPasswordPage.tsx` y `UsuariosTab.tsx`. Se registra aquí para cerrar el
  alcance; no forma parte de los 11 commits del lote.

### 13.5 Verificación

- **Tests unitarios:** `npm test` en `api/` → **112 tests en verde**, **10 archivos**
  (`bcv` 10, `classification` **19**, `schemas` 3, `optimistic-lock` 4, `money` 10,
  `cobrador-sync` 6, `config-values` 3, `parser` 14, `matcher` **31**,
  `eliminacion-definitiva` **12**). Se agregó `api/tests/eliminacion-definitiva.test.ts` (12 casos) y crecieron
  `classification` y `matcher` (este último con los casos del contraste de 4 dígitos).
- **Compilación:** `npm run build` en `api/` (`tsc -p tsconfig.json`) **OK** y en `web/`
  (`tsc --noEmit && vite build`) **OK** (~13 s en esta pasada).
- **Permisos (verificado en `api/prisma/seed.ts`):** **38 → 41** claves. Nuevas:
  `usuarios.eliminar_definitivo` y `cobradores.eliminar_definitivo` (**solo Administrador**) y
  `pagos.ver_alerta_antiguedad` (**Administrador** y **Administrativo**). Conteo por rol:
  Administrador **41** (todos), Administrativo **20** (antes 19), Consultor **10**, Cobrador **3**.
- **Endpoints:** OpenAPI **101 → 103** operaciones y Postman **101 → 103** peticiones.
  Reconciliación: **103** = **102** definiciones `router.{get,post,put,patch,delete}` en los
  `*.routes.ts` + `GET /health` público.
- **Migraciones (4, todas de datos; sin cambios de columnas ni tablas).**
  `20260921000000_permisos_eliminacion_definitiva` (inserta los 2 permisos de baja definitiva y los
  otorga a Administrador), `20260921120000_conciliacion_sufijo_4` (lleva `match.reference_suffix` a
  **4** con `INSERT … ON DUPLICATE KEY UPDATE`), `20260921130000_parametros_catalogo` (siembra el
  catálogo de 7 parámetros con `INSERT IGNORE`, para bases creadas solo con `migrate deploy`; **no**
  sobrescribe valores personalizados) y `20260921140000_permiso_alerta_antiguedad` (inserta
  `pagos.ver_alerta_antiguedad` y lo otorga a Administrador y Administrativo). El único cambio de
  `api/prisma/schema.prisma` en el rango es un **comentario** del enum de `auditoria.accion`
  (`borrar_definitivo`).
- **Parámetros (`parametros` / `api/src/lib/config-values.ts`):** `match.reference_suffix` **8 → 4**;
  `cobro.umbral_antiguedad_dias` = **30**, reutilizado por la alerta de documento viejo y por la
  marca «Viejo». Los filtros de reportes son **query params**, no claves de `parametros`
  (`fechaMovimientoDesde`, `fechaMovimientoHasta`, `antiguedadMaxDias`).
- **Contratos:** `docs/openapi.yaml` y `docs/postman_collection.json` documentan los 2 endpoints
  nuevos y los campos aditivos (`fechaMovimiento`, `antiguedadDias`, `esViejo`, `alertaAntiguedadDias`,
  `totales`).

**Con endpoints nuevos:** OpenAPI **101 → 103** operaciones y Postman **101 → 103** peticiones.

### 13.6 Archivos de esta iteración

- `api/src/modules/reportes/{reportes.service,reportes.controller,reportes.schema}.ts` — fecha de
  movimiento y su filtro, `antiguedadMaxDias`, antigüedad/marca «Viejo» y `totales`.
- `api/src/lib/classification.ts` — `alertaAntiguedadDocumento`, `antiguedadEnDias`, `esPagoViejo`.
- `api/src/modules/pagos/pagos.service.ts` — `alertaAntiguedadDias` gated por permiso.
- `api/src/lib/audit.ts` — acción `borrar_definitivo`.
- `api/src/modules/usuarios/{usuarios.routes,usuarios.controller,usuarios.service}.ts` y
  `api/src/modules/cobradores/{cobradores.routes,cobradores.controller,cobradores.service}.ts` —
  `removeDefinitivo()`.
- `api/prisma/seed.ts` — 3 permisos nuevos (41); `match.reference_suffix` a 4; Administrativo +1.
- `api/src/config/env.ts`, `api/.env.example` — `MATCH_REFERENCE_SUFFIX` a 4.
- `api/prisma/migrations/20260921000000_permisos_eliminacion_definitiva/`,
  `20260921120000_conciliacion_sufijo_4/`, `20260921130000_parametros_catalogo/`,
  `20260921140000_permiso_alerta_antiguedad/` — 4 migraciones de datos.
- `api/tests/eliminacion-definitiva.test.ts` — suite nueva; `api/tests/classification.test.ts` y
  `api/tests/matcher.test.ts` — casos nuevos.
- `web/src/features/reportes/ReportesPage.tsx`, `web/src/api/reportes.ts`,
  `web/src/types/index.ts` — filtros, columnas y totales.
- `web/src/features/pagos/{ReportarPage,MisPagosPage,EditarPagoDialog,pago-utils}.tsx`,
  `web/src/features/validacion/ValidacionPage.tsx` — alerta, edición de fecha y buscador de cobrador.
- `web/src/features/configuracion/{UsuariosTab,CobradoresTab}.tsx`, `web/src/api/{usuarios,cobradores}.ts`
  — baja definitiva en la UI.
- `web/src/lib/format.ts`, `web/src/features/movimientos/MovimientosPage.tsx` — fix del corrimiento
  de un día.
- `docs/openapi.yaml`, `docs/postman_collection.json`, los tres README, `CAMBIOS-SOLICITADOS.md` y
  este `CHANGELOG.md` — sincronización documental.

---

## 14. Iteración 10 — Antigüedad determinada por el movimiento bancario y persistida al validar (CR-005)

La antigüedad de un pago deja de derivarse al vuelo contra "hoy" y pasa a ser la brecha entre la
`fechaPago` reportada por el cobrador y la `fechaEjecucion` del **movimiento bancario vinculado**,
determinada y **persistida al validar**. A diferencia de las iteraciones 6 y 7 (y como la 8 y la 9),
esta **no agrega endpoints**: OpenAPI sigue en **103** operaciones y Postman en **103** peticiones.
Sí **cambia el esquema** (1 enum + 1 columna nullable) con **una migración sin backfill**; los
permisos siguen en **41**. Registro prospectivo original en
[`CAMBIOS-SOLICITADOS.md`](./CAMBIOS-SOLICITADOS.md) (CR-005).

**Dos decisiones del dueño (2026-09-21):** (1) **visibilidad — opción (c):** el veredicto se muestra
en el **toast de validación** y en la **columna «Antigüedad»** de la bandeja; (2) **comparador y
umbral:** la comparación final es `>=` ("N días o más = viejo") con el umbral en el **`1`** ya
configurado por el dueño, **sin migración de datos**.

### 14.1 Cálculo y veredicto

- **Brecha firmada en días completos.** `antiguedadEnDias(fechaPago, fechaEjecucionMovimiento)`
  (`api/src/lib/classification.ts`) devuelve
  `Math.floor((fechaPago - fechaEjecucionMovimiento) / 86_400_000)`: `0` = mismo día; positivo = el
  movimiento es anterior, es decir **pago viejo**; negativo = el movimiento es posterior (nunca
  viejo, se conserva con signo).
- **Comparador final `>=`.** `esPagoViejo(antiguedadDias, umbralDias)` = `antiguedadDias >=
  umbralDias`. Con el umbral `1` configurado por el dueño, una brecha de 1 día **ya** es vieja y una
  de `0` no. El borde exacto del umbral **sí** cuenta (a diferencia del `>` de la iteración 9).
- **Alerta eliminada.** `alertaAntiguedadDocumento` ya no existe. `clasificarPorAntiguedad` se
  conserva por compatibilidad, pero **no** alimenta `tipoCobroDerivado`: solo la clasificación
  heredada que se calcula al reportar cuando llega `fechaDocumento` (`fuenteDerivacion = 'reporte'`).

### 14.2 Esquema y migración

- **Enum y columna nuevos.** `enum FuenteDerivacion { reporte, movimiento }` y
  `PagoReportado.fuenteDerivacion FuenteDerivacion? @map("fuente_derivacion")` en
  `api/prisma/schema.prisma` (líneas 215 y 243).
- **Migración de una sola sentencia, sin backfill.**
  `api/prisma/migrations/20260921230918_antiguedad_movimiento_fuente/migration.sql`:
  `ALTER TABLE \`pagos_reportados\` ADD COLUMN \`fuente_derivacion\` ENUM('reporte', 'movimiento') NULL`.
  Los pagos previos quedan en `NULL` y no entran en los buckets de nuevo/viejo hasta validarse.

### 14.3 Escritura y lectura del veredicto

- **Escritura en 5 caminos.** `validarPago` (`conciliacion.service.ts:120-151`) y `validarLote`
  (`:338-360`) persisten `tipoCobroDerivado` + `fuenteDerivacion = 'movimiento'` +
  `revisarClasificacion` en el mismo CAS; `editarPago` (`pagos.service.ts:486-493`) lo recalcula
  contra el movimiento **solo si cambia `fechaPago`** en un pago validado; `revertirPago`
  (`pagos.service.ts:659-663`) lo **limpia**; `reportarPago` (`pagos.service.ts:199-201`) marca
  `fuenteDerivacion = 'reporte'`.
- **Lectura del veredicto persistido.** El reporte nuevo vs. viejo agrupa por `tipo_cobro_derivado`
  restringido a `fuente_derivacion = 'movimiento'` (`reportes.service.ts`, `soloFuenteMovimiento:
  true`); el dashboard aplica el mismo criterio (`dashboard.service.ts:214-231`). Un pago sin
  veredicto de movimiento queda **excluido** de esos agregados.
- **Payload aditivo.** `serializePago()` (`pagos.service.ts:82-87`) emite `antiguedadDias` nullable,
  calculado solo cuando `fuenteDerivacion === 'movimiento'` y existe la fecha del movimiento; en
  cualquier otro caso es `null`. Es el espejo del veredicto persistido, no un recálculo del cliente.

### 14.4 Filtro realineado y contrato

- **El filtro `antiguedadMaxDias` se mide contra el movimiento.** `condicionAntiguedadSql()`
  (`reportes.service.ts`) usa `EXISTS (SELECT 1 FROM movimientos_banco mb WHERE mb.id =
  p.movimiento_banco_id AND DATEDIFF(p.fecha_pago, mb.fecha_ejecucion) < N)`; el borde sigue siendo
  **estricto** ("menor a N días"). Un pago **sin movimiento vinculado queda excluido** mientras el
  filtro esté activo.
- **Campos de fila coherentes.** `camposAntiguedad()` (`reportes.service.ts:296-309`) emite
  `antiguedadDias` firmado y `esViejo` con `>=`; sin movimiento, `antiguedadDias: null` y
  `esViejo: false`.
- **Contrato.** `docs/openapi.yaml`: se **retira** `alertaAntiguedadDias` del esquema `Pago` y del
  endpoint `/reportes/cobros`; se **agregan** `fuenteDerivacion` (enum nullable) y `antiguedadDias`
  (nullable). La entrada `fechaDocumento` de `POST /pagos` se conserva, con su descripción corregida
  para aclarar que **no** determina el veredicto que leen los reportes. En
  `docs/postman_collection.json` no había campos obsoletos (no declara respuestas de pago); se
  aclaró la descripción de «Reportar pago».

### 14.5 Retiro de la alerta y visibilidad (UI)

- **Alerta retirada del frontend.** `AlertaAntiguedadBadge` eliminado y removido de `ReportesPage`,
  `MisPagosPage` y `ValidacionPage`; `alertaAntiguedadDias` fuera de `web/src/types/index.ts`.
- **Permiso huérfano (deliberado).** `pagos.ver_alerta_antiguedad` **sigue** en `api/prisma/seed.ts`
  y en la base (**41** permisos), pero ya **no lo lee** ni la API ni la UI. El seed **no** se toca.
- **Visibilidad del veredicto (decisión del dueño, opción (c)).** Columna **«Antigüedad»** en la
  bandeja de validación (`AntiguedadVeredicto` en `web/src/features/pagos/pago-utils.tsx`, montada
  en `ValidacionPage.tsx:479-481`), con `—` cuando el pago no tiene veredicto de movimiento (p. ej.
  un `pendiente`), y **toast de validación** (`descripcionVeredicto()`, `ValidacionPage.tsx:213`):
  `Del día` / `Viejo (2 días)`.

### 14.6 Verificación

- **Tests unitarios:** `npm test` en `api/` → **109 passed / 10 archivos**, incluida la suite
  `classification` con los casos borde de la brecha firmada y del comparador `>=`.
- **Compilación:** `npm run build` en `api/` **OK** y en `web/` **OK**.
- **Integración:** **14 passed** (10 pre-existentes + **4** de CR-005 en
  `api/tests/integration/pagos.int.test.ts`: brecha vieja, mismo día, borde del umbral y ausencia de
  movimiento).
- **Permisos (verificado en `api/prisma/seed.ts`):** **41**, sin cambios por CR-005.
- **Contratos:** `docs/openapi.yaml` **103** operaciones y `docs/postman_collection.json` **103**
  peticiones (sin cambios de conteo; CR-005 no agrega ni quita endpoints).

**Sin endpoints nuevos:** OpenAPI sigue en **103** operaciones y Postman en **103** peticiones.

### 14.7 Archivos de esta iteración

- `api/src/lib/classification.ts` — `antiguedadEnDias` (brecha firmada), `esPagoViejo` (`>=`);
  `alertaAntiguedadDocumento` eliminada.
- `api/src/modules/pagos/pagos.service.ts` — `serializePago` emite `antiguedadDias`; `reportarPago`
  marca `fuente_derivacion = 'reporte'`; `editarPago` recalcula y `revertirPago` limpia el veredicto.
- `api/src/modules/conciliacion/conciliacion.service.ts` — `validarPago` y `validarLote` persisten el
  veredicto desde el movimiento.
- `api/src/modules/reportes/{reportes.service,reportes.controller}.ts` — filtro realineado al
  movimiento y campos de fila coherentes.
- `api/src/modules/dashboard/dashboard.service.ts` — lee el veredicto persistido
  (`fuente_derivacion = 'movimiento'`).
- `api/prisma/schema.prisma` — enum `FuenteDerivacion` y columna `fuente_derivacion`.
- `api/prisma/migrations/20260921230918_antiguedad_movimiento_fuente/` — 1 columna, sin backfill.
- `api/prisma/seed-demo.ts` — datos de demostración alineados al veredicto persistido.
- `api/tests/classification.test.ts`, `api/tests/integration/pagos.int.test.ts` — casos nuevos.
- `web/src/features/validacion/ValidacionPage.tsx`,
  `web/src/features/pagos/{pago-utils,MisPagosPage}.tsx`,
  `web/src/features/reportes/ReportesPage.tsx`, `web/src/types/index.ts` — columna «Antigüedad»,
  toast y retiro de la alerta.
- `docs/openapi.yaml`, `docs/postman_collection.json`, los tres README, `CAMBIOS-SOLICITADOS.md` y
  este `CHANGELOG.md` — sincronización documental.
