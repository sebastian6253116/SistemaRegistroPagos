# API — Sistema de Gestión de Cobros

Backend REST en **Node.js + TypeScript + Express + Prisma** sobre MySQL/MariaDB.
La documentación completa del proyecto está en el [`README.md`](../README.md) de la raíz.

## Requisitos

- Node.js 18+ (probado con v22)
- MySQL o MariaDB en `localhost:3306` (XAMPP)

## Instalación y ejecución

```powershell
# 1) Crear la base de datos (una sola vez)
& "C:\xampp\mysql\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS gestion_cobros CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2) Dependencias y entorno
npm install
Copy-Item .env.example .env

# 3) Esquema + datos base
npx prisma migrate deploy
npm run seed          # roles, permisos, Banca Amiga, usuarios de prueba
npm run seed:demo     # (opcional) ~30 días de datos de demostración

# 4) Servidor en modo desarrollo
npm run dev           # http://localhost:4000
```

Comprobar que está vivo: `Invoke-RestMethod http://localhost:4000/health`

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga en caliente (tsx watch) |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta el build de producción |
| `npm run migrate` | Crea/aplica migraciones en desarrollo |
| `npm run migrate:deploy` | Aplica migraciones existentes |
| `npm run seed` | Datos base (roles, permisos, catálogos, usuarios) |
| `npm run seed:demo` | Datos de demostración idempotentes |
| `npm test` | Tests unitarios (vitest) |
| `npm run prisma:generate` | Regenera el cliente Prisma |

## Estructura

```
prisma/   schema.prisma, migrations/, seed.ts, seed-demo.ts
src/
  config/      variables de entorno validadas con Zod
  lib/         dinero (tasa), clasificación, auditoría, http, parámetros, config-values, upload (endurecimiento de archivos), parser BCV
  middleware/  auth (JWT), requirePermiso (RBAC), validate (Zod), errores, rate limit
  jobs/        tareas en segundo plano (sincronización horaria de la tasa BCV)
  modules/     un módulo por dominio: <name>.{schema,service,controller,routes}.ts
tests/         money, matcher, parser, classification, bcv
```

Antes de escribir código en este módulo, lea [`CONVENTIONS.md`](./CONVENTIONS.md).

## Job en segundo plano — tasa BCV

El módulo `tasas-bcv` mantiene un histórico **informativo** de la tasa publicada por el BCV en la
tabla `tasas_bcv`, separado de `tasas_referencia`. Un job en proceso
(`src/jobs/bcv-rate.job.ts`) consulta `https://api.farmavid.com.ve/api/rates` cada 60 minutos y
guarda únicamente las tasas nuevas, deduplicadas por el `id` de la API. La API externa devuelve
solo el último valor; el histórico lo construye este backend.

- Se arranca con `startBcvJob()` y se detiene en el apagado ordenado con `stopBcvJob()`.
- El flag `parametros.bcv.job_habilitado` se lee **en cada ciclo**, así que activar/desactivar la
  consulta desde la UI (`PUT /tasas-bcv/job`) surte efecto sin reiniciar el servidor.
- Un fallo de la API externa se registra y se descarta: el job nunca tumba el proceso.
- Solo se usa el valor `usd`, almacenado como cadena decimal para no perder precisión.
- Esta tasa **nunca** alimenta la tasa derivada de un pago.

## Endpoints

- `../docs/openapi.yaml` — especificación OpenAPI 3.0.3 (101 operaciones)
- `../docs/postman_collection.json` — colección Postman con variables y auto-login
- `../docs/schema.sql` — script SQL completo del esquema. Nota: es un artefacto derivado y puede
  quedar rezagado respecto de `schema.prisma` + `migrations/`, que son la fuente de verdad (ver
  «Limitaciones conocidas» en el [`CHANGELOG.md`](../CHANGELOG.md)).

Módulos y grupos ya incluidos en esa especificación:

| Módulo | Endpoints |
|---|---|
| `tipos-pago` | `GET/POST /tipos-pago`, `GET/PUT/DELETE /tipos-pago/:id` (baja lógica), `PUT /tipos-pago/:id/default` |
| `notificaciones` | `GET /notificaciones`, `GET /notificaciones/no-leidas`, `PATCH /notificaciones/:id/leida`, `PATCH /notificaciones/leer-todas` |
| `tasas-bcv` | `GET /tasas-bcv/actual`, `GET /tasas-bcv/historial`, `GET /tasas-bcv/job`, `PUT /tasas-bcv/job`, `POST /tasas-bcv/sincronizar` |
| `pagos` (ampliación) | `POST /pagos/:id/soporte`, `PUT /pagos/:id` (edición, incluidos los pagos **validados** con el permiso `pagos.editar`), `DELETE /pagos/:id` (borrado físico, permiso `pagos.eliminar`, solo pagos no validados), `POST /pagos/:id/revertir` (permiso `pagos.revertir_validacion`, inverso de la validación) |
| `cuentas` (ampliación) | `PUT /cuentas/:id/default` |
| `catalogos` (ampliación) | `GET /catalogos/form-pago` ahora incluye `tiposPago`, `defaults` y `reglas` |
| `archivos` | `GET /uploads/:filename` (montado en `/api/uploads/:filename`): descarga autenticada y autorizada por archivo de los soportes almacenados |
| `importacion` (ampliación) | `GET /importacion/plantilla` (descarga la plantilla `.xlsx`), `POST /importacion/preview`, `POST /importacion/confirmar`, `GET /importacion/lotes`, `GET /importacion/lotes/:id`, `GET /importacion/lotes/:id/errores` |

### Archivos (soportes y comprobantes)

El módulo `archivos` (`src/modules/archivos/`) sirve los archivos almacenados en `UPLOAD_DIR` a
través de `GET /api/uploads/:filename`. **No existe ya ningún montaje estático público**: una
petición directa a `GET /uploads/...` responde **404** (se eliminó el `express.static` de
`app.ts`). Reglas:

- **Autenticación obligatoria** (Bearer): sin token, **401**.
- **Autorización por archivo**, resuelta desde el registro que lo referencia:
  - comprobante de un `PagoReportado`: permitido con `pagos.ver_todos`, con `pagos.validar`, o si
    el llamador es el cobrador del pago (`user.cobradorId === pago.cobradorId`);
  - soporte de un `Gasto`: permitido con `gastos.ver`;
  - cualquier otro caso: **403**. Un archivo que ningún registro referencia responde **404** (no se
    sirven huérfanos ni se filtra su existencia).
- **Sin traversal**: el nombre pasa por `path.basename()` y la ruta resuelta se verifica dentro de
  `UPLOAD_DIR`; separadores, `..` o bytes de control responden **400**.
- La respuesta usa el `Content-Type` derivado de la lista blanca de extensiones
  (`mimeTypeForFilename`) y agrega `X-Content-Type-Options: nosniff`,
  `Content-Disposition: inline` y `Cache-Control: private, no-store`.

#### Endurecimiento de subidas (`src/lib/upload.ts`)

- Lista blanca explícita `ALLOWED_MIME_EXTENSIONS`: `image/png` (.png), `image/jpeg` (.jpg),
  `image/webp` (.webp), `image/gif` (.gif) y `application/pdf` (.pdf). Todo lo demás se rechaza
  (400); en particular **`image/svg+xml` no se acepta**, porque puede contener contenido activo.
- La **extensión almacenada se deriva del MIME validado**, nunca del nombre original
  (`nombreSeguro`), de modo que un nombre manipulado no puede introducir otra extensión.
- Se mantienen el límite de **5 MB** y el formato almacenado `/uploads/<archivo>` devuelto en
  `soporteUrl`.


### Plantilla de importación bancaria

- `GET /importacion/plantilla` (permiso `movimientos.importar`,
  `api/src/modules/importacion/importacion.routes.ts`) devuelve un archivo `.xlsx` descargable. El
  controlador fija el `Content-Type`
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y
  `Content-Disposition: attachment; filename="plantilla-importacion-bancaria.xlsx"`.
- La plantilla se genera con **ExcelJS** (`generarPlantilla()`,
  `api/src/modules/importacion/importacion.service.ts`): una hoja `Movimientos`, fila 1 de
  encabezado en **negrita** (`Referencia` | `Monto en Bs` | `Fecha de ejecución`) y fila 2 con
  **una única fila de ejemplo** (`EJEMPLO-0000` | `0,01` | `01/01/2000`).
- Reenviada a `POST /importacion/preview` con `primeraFilaEsEncabezado=true` (el valor por defecto
  de la UI), la plantilla sin modificar produce `filasTotales: 1` y `erroresDeteccion: 0`. Sin ese
  flag, la fila de encabezado se interpreta como fila de datos y el monto falla la validación.
- La fila de ejemplo debe **reemplazarse o eliminarse** antes de importar: los movimientos
  importados **no se pueden eliminar** desde la aplicación (el módulo `movimientos` solo expone
  `GET /movimientos` y `GET /movimientos/:id`).

### Eliminación y reversión de pagos

- `DELETE /pagos/:id` exige el permiso `pagos.eliminar` y solo elimina pagos **no validados**
  (`pendiente`, `rechazado`, `duplicado`); responde **409** si el pago está `validado`. Es un
  borrado físico cuyo registro completo se escribe en la **auditoría** (entidad `pagos_reportados`,
  acción `borrar`, `datosAntes`) **dentro de la misma transacción** que el `delete`, de modo que
  ambos succeed o fallan juntos.
- `POST /pagos/:id/revertir` exige el permiso `pagos.revertir_validacion` y solo aplica a pagos
  `validado` (**409** en otro estado). En una transacción: elimina la `conciliacion`, devuelve el
  `movimientoBanco` a `no_conciliado` y reinicia el pago al `estado` destino
  (`pendiente`/`rechazado`), limpiando `movimientoBancoId`, `validadoPor` y `validadoAt`. Registra
  las instantáneas anterior y posterior en la auditoría.
- El helper `auditar` de `src/lib/audit.ts` acepta ahora un `tx` opcional: cuando se pasa, la
  escritura de auditoría participa de la transacción del llamador (y un fallo revierte la
  operación en lugar de silenciarse).

### Edición de pagos validados

- `PUT /pagos/:id` exige en la ruta `pagos.reportar` **o** `pagos.editar`; sin ninguno de los dos
  responde **403** en el guard. Un pago `pendiente` lo edita el cobrador con `pagos.reportar`;
  `pagos.ver_todos` es de **solo lectura** y ya **no** habilita la edición. Editar un pago
  **`validado`** exige **además** el permiso elevado **`pagos.editar`**, verificado en el servicio
  contra el estado fresco: con solo `pagos.reportar` responde **403**. Los pagos
  `rechazado`/`duplicado` responden **409** (no hay conciliación viva que recalcular).
- La edición de un pago `validado` es **en caliente y dentro de una transacción**:
  `evaluarVinculoConciliacion()` (`src/modules/conciliacion/matcher.ts`) re-evalúa el vínculo con el
  movimiento usando los valores **nuevos** (referencia, monto dentro de `match.amount_tolerance_bs`,
  fecha dentro de `match.date_window_days` y la misma cuenta recaudadora). Si el vínculo se
  mantiene, se recalcula `conciliaciones.diferenciaBs` y se audita (`datosAntes`/`datosDespues`) en
  la **misma transacción**; si se rompe, responde **409** y **no escribe nada** (primero debe
  revertirse la validación).
- El permiso **`pagos.editar`** se siembra en `api/prisma/seed.ts` y se concede al rol
  **Administrador** vía `ALL` y al rol **Administrativo** (que además recibe
  `pagos.revertir_validacion`). Con él el seed define **41 permisos** en total y estos conteos por
  rol, verificados en la base: Administrador **41**, Administrativo **20**, Consultor **10**,
  Cobrador **3**. El rol **Consultor** conserva `pagos.ver_todos`, pero es **estrictamente de solo
  lectura**: `pagos.ver_todos` no habilita ninguna ruta de escritura.
- La alerta de **documento viejo** (`alertaAntiguedadDias`, en `serializePago`/`serializarPago`) es
  un límite **de servidor**: exige `pagos.ver_alerta_antiguedad` (sembrado en Administrador vía
  `ALL` y en Administrativo). Sin ese permiso el campo viaja siempre en `null` —nunca se resuelve
  solo en el frontend— y el shape de la respuesta no cambia.

### Validación de montos en pagos

- `montoBs` y `montoUsd` comparten el helper `decimalString` de
  `api/src/modules/pagos/pagos.schema.ts`: debe resolver a un decimal finito y estrictamente
  positivo. Un valor no numérico, cero o negativo responde **400**
  `"El monto debe ser un numero positivo"` en `POST /pagos` y `PUT /pagos/:id`, en lugar de un 500.
- El helper equivalente de gastos (`api/src/modules/gastos/gastos.schema.ts`) es **distinto** (su
  regex permite `0`). Ese caso **no** es un 500: el servicio de gastos envuelve `calcularTasa` en un
  `try/catch` y lo convierte en **400**. La divergencia de helpers queda como inconsistencia
  conocida (ver CHANGELOG §10).

## Conciliación: contraste por referencia y duplicados (CR-001)

Motor: `src/modules/conciliacion/matcher.ts`.

- **Contraste por referencia.** La referencia se compara **normalizada a dígitos**
  (`normalizarReferencia`, p. ej. `12-34` → `1234`). El sufijo de contraste es el último
  `match.reference_suffix` (**4** por defecto) de la referencia reportada, o sus propios
  dígitos si es más corta. Se exige un **mínimo de 4 dígitos** (`MIN_DIGITOS_CONTRASTE`): una
  referencia con menos de 4 dígitos **no** matchea por sufijo, solo por **igualdad exacta**.
  La comparación es de doble sentido: `db.endsWith(sufijoA) || da.endsWith(sufijoB) ||
  sufijoA === sufijoB`.
- **Coincidencia limpia.** Un movimiento candidato debe estar `no_conciliado`, sin pago
  enlazado, con el monto en Bs dentro de `match.amount_tolerance_bs` (**0.01**) y la fecha
  dentro de `match.date_window_days` (**3**).
- **Duplicado (`buscarDuplicado`).** Un pago es duplicado cuando coincide por referencia
  (misma regla y mínimo de 4 dígitos) **y** monto en Bs con un movimiento que **ya está
  conciliado con otro pago**, dentro de la misma cuenta recaudadora. La **ventana de fecha
  NO se aplica** de forma deliberada: un reporte duplicado suele traer una fecha equivocada y
  esa fecha es justamente el origen del duplicado.
- **Validación automática bloqueada (`validarPago`).** Sin `movimientoBancoId`, si hay
  duplicado responde **409** y no valida: el pago queda `pendiente` para que un validador
  elija el movimiento manualmente (`movimientoBancoId`). La vía manual no se ve afectada. Una
  coincidencia **única y no duplicada** sigue validándose automáticamente.
- **Validación en lote (`validarLote`).** Los duplicados se reportan dentro del array
  `errores` ya existente (motivo con «posible duplicado») y no se validan.
- **Señal al vuelo, sin persistencia.** `GET /pagos/:id/coincidencias` devuelve
  `{ data, duplicado }`; `data` conserva su forma original y `duplicado` es **aditivo** y
  nullable. No hay estado nuevo, ni columna, ni migración: el duplicado se calcula al
  consultar.

## Banco de origen opcional

El banco de origen (`PagoReportado.bancoOrigenId`) es **nullable** y su obligatoriedad es
configurable con el parámetro `pago.banco_origen_obligatorio` (`'1'` por defecto = obligatorio,
`'0'` = opcional), expuesto tipado como `ConfigValues.bancoOrigenObligatorio`
(`src/lib/config-values.ts`).

- `POST /pagos` y `PUT /pagos/:id`: `bancoOrigenId` es **opcional**. Si el parámetro está activo y
  no se envía, el API responde **400** `"El banco de origen es obligatorio."`.
- En el `PUT` la actualización es parcial: un `bancoOrigenId` **ausente** deja el banco guardado
  sin cambios, mientras que `null` lo limpia. La regla se evalúa sobre el valor resultante, igual
  que en el reporte.
- `serializePago` **nunca** emite `null` en `bancoOrigen`: para un pago sin banco devuelve
  `{ id: null, nombre: "N/A", codigo: "N/A" }`, de modo que ningún cliente necesita un caso
  especial.
- `GET /catalogos/form-pago` devuelve además `reglas: { bancoOrigenObligatorio: boolean }`.
- La columna se hizo nullable en la migración `20260920005227_banco_origen_opcional` en lugar de
  sembrar un banco ficticio "N/A": una fila fantasma contaminaría el catálogo de bancos y los
  filtros de reportes.
