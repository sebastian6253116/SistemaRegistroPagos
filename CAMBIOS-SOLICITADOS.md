# CAMBIOS SOLICITADOS — Sistema de Gestión de Cobros

Documento **prospectivo**: registra cambios pedidos por el negocio. Cada entrada describe el pedido,
qué existía en el código al momento de redactarla (verificado), el delta real, el impacto y las
decisiones que faltaban cerrar.

> **Diferencia con `CHANGELOG.md`:** el CHANGELOG documenta lo **ya construido**. Este archivo
> conserva el registro de lo **pedido** —incluidas las entradas que ya se implementaron— como
> historia de la decisión. El detalle de la construcción vive en el CHANGELOG.
>
> **Estado global:** **CR-001 implementado** (2026-09-20; ver [`CHANGELOG.md`](./CHANGELOG.md) §9).
> **CR-002 implementado** (2026-09-20; ver [`CHANGELOG.md`](./CHANGELOG.md) §8). Ambas entradas
> **sí** cambiaron `api/src`, `api/prisma` y `web/src`, a diferencia de una lectura inicial de este
> documento. Los **hallazgos de la auditoría de CR-002** (autorización, permisos de `Administrativo`,
> monto 500 y CVEs de `xlsx`) quedaron **resueltos** (ver [`CHANGELOG.md`](./CHANGELOG.md) §10 y la
> sección «CR-002 — Hallazgos de la auditoría» al final de este documento).
>
> **CR-003 implementado** (2026-09-20; ver [`CHANGELOG.md`](./CHANGELOG.md) §11): plantilla
> descargable para la importación bancaria. A diferencia de CR-001 y CR-002, **sí agrega un
> endpoint**: los conteos de contrato pasan de **100 → 101** en OpenAPI y en Postman.
>
> **CR-004 implementado** (2026-09-21; ver [`CHANGELOG.md`](./CHANGELOG.md) §13): lote de cuatro
> frentes —reportes por antigüedad, alerta de «documento viejo» (pago viejo contra movimiento
> bancario reciente), baja definitiva con permiso propio para usuarios y cobradores, y correcciones
> de UX—. **Agrega 2 endpoints** (OpenAPI **101 → 103**, Postman **101 → 103**), **3 permisos**
> (**38 → 41** claves) y **4 migraciones de datos** (permisos y catálogo de parámetros), **sin**
> cambios de esquema. **Superado por CR-005** en lo que respecta al cálculo de antigüedad y a la
> alerta de «documento viejo» (ver abajo).
>
> **CR-005 implementado** (2026-09-21; ver [`CHANGELOG.md`](./CHANGELOG.md) §14): la antigüedad de un
> pago pasa a ser la brecha entre la `fechaPago` reportada y la `fechaEjecucion` del **movimiento
> bancario vinculado**, determinada y **persistida al validar** (enum `FuenteDerivacion` + columna
> `pagos_reportados.fuente_derivacion`), con el comparador final `>=` ("N días o más = viejo") y
> **sin migración de datos**. **No agrega endpoints**: OpenAPI sigue en **103** operaciones y Postman
> en **103** peticiones; los permisos siguen en **41** (el permiso `pagos.ver_alerta_antiguedad`
> queda **huérfano**, ya no lo lee la API ni la UI).

---

## CR-001 — Conciliación por referencia parcial (4 dígitos) y duplicados a validación manual

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-20 |
| **Estado** | **IMPLEMENTADO (2026-09-20)** — ver «Estado de implementación» y [`CHANGELOG.md`](./CHANGELOG.md) §9 |
| **Solicitante** | Negocio (Dueño del proceso de cobros) |
| **Área** | Conciliación de pagos reportados (`api/src/modules/conciliacion/`) |
| **Impacto** | Backend (matcher + validación), contrato de API, UI de validación, tests |

> **Estado de implementación (2026-09-20).** Se implementaron **R1, R2 y R3**. El detalle completo
> está en el [`CHANGELOG.md`](./CHANGELOG.md) §9. Resumen verificado contra el código:
>
> - **R1** — contraste por referencia con `MIN_DIGITOS_CONTRASTE = 4` y normalización a dígitos
>   (`api/src/modules/conciliacion/matcher.ts`); con menos de 4 dígitos solo matchea por igualdad
>   exacta.
> - **R3** — `buscarDuplicado()` detecta el movimiento **ya conciliado con otro pago** (misma
>   cuenta, referencia + monto en Bs, **sin** ventana de fecha); `validarPago()` bloquea la vía
>   automática con **409** y `validarLote()` lo reporta en `errores`; `GET /pagos/:id/coincidencias`
>   devuelve `{ data, duplicado }`.
> - **Sin endpoints nuevos** (OpenAPI sigue en **100** operaciones, Postman en **100** peticiones);
>   **sin estado, columna ni migración nuevos** (la señal se calcula al vuelo).
>
> Las secciones §1–§9 siguientes **conservan el texto original** (la verificación y las decisiones
> tal como se redactaron al pedir el cambio). Los estados «Hoy» / «NO EXISTE» de §3 corresponden al
> **momento de la especificación**, no al estado actual; lo construido manda en el CHANGELOG.

### 1. Pedido textual

> «En el proceso de conciliación de pagos reportados: si los cobradores colocan ya sea la
> referencia completa o los últimos 4 dígitos de la transacción, siempre y cuando coincidan tanto
> los últimos 4 dígitos como el monto en Bs. Y si este pago indica que está duplicado, quiero que
> quede pendiente por validar y sea la persona que se encarga de validar los pagos quien realice la
> validación manual.»

### 2. Interpretación — tres requisitos

| ID | Requisito |
|---|---|
| **R1** | El cobrador puede reportar la **referencia completa** *o* los **últimos 4 dígitos** de la transacción. |
| **R2** | La coincidencia con el movimiento bancario exige **ambas** condiciones: los últimos 4 dígitos **y** el monto en Bs. |
| **R3** | Si el pago se detecta como **duplicado**, **no** se cierra automáticamente: queda en estado `pendiente` y la validación la hace **manualmente** quien valida pagos. |

---

### 3. Comportamiento actual (verificado en código)

#### 3.1 Motor de coincidencias

`api/src/modules/conciliacion/matcher.ts`

| Aspecto | Hoy |
|---|---|
| Sufijo de referencia | `match.reference_suffix` = **8** (tabla `parametros`; respaldo en `MATCH_REFERENCE_SUFFIX`). |
| `sufijoReferencia()` | Líneas 54–58: si la referencia tiene **menos** dígitos que el sufijo configurado, usa el valor completo. |
| `referenciasCoinciden()` | Líneas 61–76: coincide si son **iguales**, o si una **termina con** el sufijo de la otra, o si los sufijos son iguales. |
| Condiciones de `calcularPuntaje()` | Líneas 82–121: exige **referencia** (exacta o sufijo) **Y** monto dentro de tolerancia **Y** fecha dentro de la ventana. Si falla cualquiera, devuelve `null`. |
| Tolerancia de monto | `match.amount_tolerance_bs` = **0.01** Bs. |
| Ventana de fecha | `match.date_window_days` = **3** días. |
| Filtro SQL | Líneas 142–156: mismo `cuentaRecaudadoraId`, `estadoConciliacion = 'no_conciliado'`, `pago: null`, monto en ±tolerancia, fecha en ±ventana y `OR` de referencia exacta / `endsWith(sufijo)`. |

**Consecuencia sobre R1:** los últimos 4 dígitos **ya funcionan hoy, pero por accidente**. Con
`suffix = 8` y el cobrador escribiendo `5678`, `sufijoReferencia('5678', 8)` cae al valor completo
(`'5678'`) y el `endsWith('5678')` del SQL matchea referencias bancarias de 10 dígitos. No está
declarado, no está parametrizado como «mínimo 4» y no está cubierto por un caso de prueba explícito.

**Consecuencia sobre R2:** el monto **ya es obligatorio y obligatorio-con-la-referencia**. R2 no
agrega una condición nueva; agrega una **precisión**: ¿la comparación de monto debe ser exacta o
con tolerancia? Hoy es ±0.01 Bs (prácticamente exacta).

#### 3.2 Detección de duplicados — **NO EXISTE**

| Punto | Evidencia |
|---|---|
| El estado `duplicado` existe en el enum `EstadoPago` | `pendiente`, `validado`, `rechazado`, `duplicado` (`api/prisma/schema.prisma`). |
| Pero **solo** se alcanza por acción manual del validador | `marcarDuplicado()` en `conciliacion.service.ts:187–213`, expuesto en `POST /api/pagos/:id/duplicado` con permiso `pagos.marcar_duplicado` (`pagos.routes.ts:80–85`). |
| El motor **no** infiere duplicados | `matcher.ts` no tiene ningún concepto de duplicado. |
| El motor **no puede ver** un movimiento ya usado | `buscarCoincidencias` filtra `pago: null` y `estadoConciliacion: 'no_conciliado'` (líneas 145–146): un movimiento ya conciliado **desaparece** del universo de candidatos, así que el sistema no puede señalarlo. |
| Nada impide reportar la misma transacción dos veces | `pagos_reportados` solo tiene `@@index([referencia])`; **no** hay restricción única por `(referencia, montoBs, cobradorId)`. |

#### 3.3 La validación automática contradice R3

`validarPago()` (`conciliacion.service.ts:47–138`): cuando `movimientoBancoId` **no** se envía
(líneas 62–73), toma la **mejor coincidencia** y cierra el pago de inmediato:
`estado = 'validado'`, movimiento → `conciliado`, `tipo = automatica`.

Es decir: hoy, ante un duplicado, el sistema **o** lo valida en silencio contra un segundo
movimiento idéntico, **o** responde «no se encontró ningún movimiento bancario compatible». Nunca
lo deja pendiente con una señal de duplicado.

---

### 4. Delta real

| Requisito | ¿Existe hoy? | Trabajo pedido |
|---|---|---|
| **R1** referencia completa **o** 4 dígitos | Parcial, implícito | Hacerlo explícito y seguro: definir un sufijo mínimo de contraste (4) independiente del valor reportado, y cubrirlo con tests. |
| **R2** 4 dígitos **y** monto Bs | Sí (ya son conjuntas) | Solo definir la precisión del monto (exacta vs. tolerancia). |
| **R3** duplicado → `pendiente` + validación manual | **No** | **Trabajo nuevo:** detectar el duplicado, marcarlo como señal y bloquear el cierre automático. |

**El corazón del pedido es R3.** Es lógica que hoy no existe en ninguna forma.

---

### 5. Comportamiento propuesto (borrador, sujeto a aprobación)

#### 5.1 Reglas de coincidencia (R1 + R2)

1. Comparar siempre por el **sufijo de contraste** (4 dígitos por defecto), **no** por la longitud
   de lo que escribió el cobrador. Así, escribir la referencia completa y escribir los 4 dígitos
   producen el **mismo** conjunto de candidatos y el mismo resultado.
2. Mantener la referencia **exacta** como señal de mayor confianza (ya pondera más en el puntaje:
   `PESO_REFERENCIA_EXACTA = 40` vs. `PESO_SUFIJO = 25`).
3. Exigir **siempre** coincidencia de sufijo **Y** monto en Bs **Y** fecha en ventana. (Sin cambios
   de forma; ya es así.)
4. Un movimiento ya conciliado **nunca** es candidato (ya es así), pero deja de ser invisible
   cuando explica el duplicado (ver 5.2).

#### 5.2 Detección y tratamiento del duplicado (R3)

> **Alcance resuelto (D1, 2026-09-20):** el duplicado se define **únicamente** como «el movimiento
> bancario ya está conciliado con otro pago».

| Situación detectada | Acción del sistema |
|---|---|
| El pago matchea un movimiento **ya conciliado con otro pago** (misma cuenta recaudadora, referencia —exacta o últimos 4 dígitos— y monto en Bs) | **No** cerrar. Dejar `pendiente` + señal `posible_duplicado` + notificar al validador. |
| El pago tiene una coincidencia **única y limpia** entre movimientos **libres** | Puede seguir la validación automática actual. |
| El validador confirma el duplicado | Marca `duplicado` (acción manual ya existente, `POST /api/pagos/:id/duplicado`). |
| El validador decide que **no** es duplicado | Valida/rechaza manualmente (acciones ya existentes). |

**Implicación técnica clave:** hoy esta detección es **estructuralmente imposible** sin una consulta
nueva. `buscarCoincidencias()` excluye por diseño los movimientos conciliados (`pago: null`,
`estadoConciliacion: 'no_conciliado'`, `matcher.ts:145–146`), así que el sistema no puede verlos. Se
necesita una búsqueda **inversa** —«¿existe un movimiento conciliado que matchee esta
referencia + monto?»— sobre `movimientoBanco` incluyendo `estadoConciliacion = 'conciliado'`, y que
el camino automático de `validarPago()` aborte cuando esa búsqueda devuelva algo.

#### 5.3 Principio de diseño

La detección de duplicados **informa**, no **decide**. El sistema propone y señala; el veredicto
—validar, rechazar o marcar `duplicado`— es siempre humano. Esto es coherente con la decisión #3
del CHANGELOG (§3, atomicidad de auditoría): las acciones irreversibles quedan en manos del
validador y auditadas.

---

### 6. Impacto

| Área | Archivos / artefactos |
|---|---|
| Motor de coincidencias | `api/src/modules/conciliacion/matcher.ts` |
| Servicio de conciliación | `api/src/modules/conciliacion/conciliacion.service.ts` (`validarPago`, `validarLote`) |
| Parámetros | `api/src/lib/config-values.ts` (`ConfigValues`) + fila nueva en `parametros` si se agrega una clave |
| Esquema / migración | Posible: si la señal de duplicado se persiste (¿columna en `pagos_reportados`?, ¿estado nuevo?) |
| Endpoints | `POST /api/pagos/:id/validar`, `GET /api/pagos/:id/coincidencias`, `POST /api/pagos/validar-lote` |
| UI | `web/src/features/validacion/ValidacionPage.tsx` (bandeja), `MisPagosPage.tsx`, `ReportarPage.tsx` |
| Permisos | `pagos.validar`, `pagos.marcar_duplicado` (existentes; evaluar si alcanzan) |
| Tests | `api/tests/matcher.test.ts` (hoy 11 casos) |
| Contratos y docs | `docs/openapi.yaml`, `docs/postman_collection.json`, `api/README.md`, `web/README.md`, `CHANGELOG.md` |

---

### 7. Criterios de aceptación (a confirmar)

- **CA-1:** Un cobrador que solo dispone de los **últimos 4 dígitos** (`5678`) obtiene coincidencia
  contra un movimiento cuya referencia termina en `5678`, con el monto dentro de tolerancia — sin
  quedar bloqueado por no tener la referencia completa. Reportar la referencia completa sigue siendo
  válido y resulta **más preciso** (contrasta hasta 8 dígitos). Una referencia de **menos de 4
  dígitos no produce match por sufijo** (solo coincidencia exacta).
  > **Corrección:** la versión original de este criterio afirmaba que ambas formas producen «el
  > mismo conjunto de candidatos». Es **falso** y se corrigió: reportar más dígitos hace el contraste
  > más estricto, no idéntico. Lo que sí se cumple es que **ambas formas pueden matchear** el mismo
  > movimiento, que es la necesidad real del cobrador.
- **CA-2:** Un pago que matchea un movimiento **ya conciliado con otro pago** (misma cuenta,
  referencia y monto) **no** pasa a `validado` por la vía automática; queda `pendiente`, señalado y
  visible en la bandeja.
- **CA-3:** El validador resuelve ese `pendiente` con las acciones existentes (validar / rechazar /
  marcar duplicado) y el sistema **no** lo cierra por su cuenta.
- **CA-4:** El validador puede resolver un `pendiente` señalado como duplicado usando las acciones
  existentes (validar / rechazar / marcar duplicado), y cada acción queda auditada.
- **CA-5:** La suite de tests cubre los casos anteriores y sigue en verde.

---

### 8. Decisiones

| # | Pregunta | Estado |
|---|---|---|
| **D1** | ¿Duplicado **de qué**? | **RESUELTA (2026-09-20).** Alcance: **el movimiento bancario ya está conciliado con otro pago**. Se descartan, por ahora, el doble reporte del mismo cobrador y el reporte cruzado entre cobradores. |
| **D2** | ¿La comparación de monto es **exacta** o con **tolerancia**? | **RESUELTA POR DEFECTO (2026-09-20).** Se **mantiene la tolerancia** `match.amount_tolerance_bs = 0.01` Bs (verificado en la base); no se cambió. Decisión tomada por defecto (era la recomendación); el dueño del producto puede pedir comparación exacta y se revisa. |
| **D3** | ¿La validación automática se **conserva** para el caso limpio, o **todo** pasa a validación manual? | **RESUELTA POR DEFECTO (2026-09-20).** Se **conserva** la validación automática **solo** para una coincidencia **única y no duplicada**; únicamente los duplicados dejan de cerrarse solos y quedan `pendiente`. Decisión tomada por defecto; el dueño del producto puede pedir que todo pase a validación manual. |
| **D4** | ¿La señal «posible duplicado» se **persiste** (columna/estado nuevo) o se **calcula al vuelo** al abrir la bandeja? | **RESUELTA POR DEFECTO (2026-09-20).** Se **calcula al vuelo** al consultar (`buscarDuplicado` en `GET /pagos/:id/coincidencias`), sin persistencia, sin columna, sin estado nuevo y **sin migración**. Decisión tomada por defecto; persistirla exigiría columna/estado + migración y queda a decisión del dueño del producto. |

---

### 9. Fuera de alcance

- No se implementó nada. **Cero** cambios en código, esquema o contratos.
- No se define aquí la pantalla exacta ni el texto de la alerta en la UI.
- No se modifica la regla «un movimiento bancario ↔ un pago reportado».
- **Diferido (no seleccionado en D1):** el doble reporte de la misma transacción por el mismo
  cobrador, el reporte cruzado entre cobradores y la derivación por coincidencia ambigua. Pueden
  retomarse en una iteración posterior; no forman parte de CR-001 tal como quedó aprobado.

> **Actualización (2026-09-20):** esta sección describía el estado **al redactar el pedido**. CR-001
> **ya fue implementado** (ver «Estado de implementación» arriba y CHANGELOG §9). Se mantiene aquí
> como registro de la decisión original. La detección de duplicado se limitó a «movimiento ya
> conciliado con otro pago» (D1); los casos diferidos siguen fuera de alcance.

---

## CR-002 — Restablecer filtros, edición de pagos y edición desde la bandeja de validación

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-20 |
| **Estado** | **IMPLEMENTADO (2026-09-20)** — ver «Estado de implementación» y [`CHANGELOG.md`](./CHANGELOG.md) §8 |
| **Solicitante** | Negocio (Dueño del proceso de cobros) |
| **Área** | Frontend (filtros, `MisPagosPage`, `ValidacionPage`) + Backend (`pagos`) |
| **Impacto** | 14 secciones con filtros, permisos, contrato de API, auditoría |

> **Estado de implementación (2026-09-20).** Se implementaron **R1, R3, R4 y R5**. El detalle
> completo está en el [`CHANGELOG.md`](./CHANGELOG.md) §8. Resumen verificado contra el código:
>
> - **R1** — `ClearFiltersButton` (`web/src/components/common/ClearFiltersButton.tsx`), adoptado en
>   las **14** secciones filtradas; deshabilitado sin filtros activos; reinicia a la página 1.
> - **R3** — `editarPago()` (`api/src/modules/pagos/pagos.service.ts`) permite editar un pago
>   `validado` en caliente, con recálculo atómico de `conciliaciones.diferenciaBs`.
> - **R4/R5** — permiso **`pagos.editar`** (`api/prisma/seed.ts`; **38** permisos en total) y acción
>   «Editar pago» en `ValidacionPage` sobre `pendiente`/`validado`.
> - **Sin endpoints nuevos:** OpenAPI sigue en **100** operaciones y Postman en **100** peticiones.
>
> Las secciones §2–§9 siguientes **conservan el texto original** (la verificación y las decisiones
> tal como se redactaron). Los estados «NO EXISTE» de §2 corresponden al **momento de la
> especificación**, no al estado actual; lo construido manda en el CHANGELOG.

### 1. Pedido textual

> «En los filtros de la sección de pagos, cuando filtran, necesito un botón o algo que me deje
> restablecer el filtro, es decir que quite los filtros — y así con cada uno de los filtros que se
> aplican en las distintas secciones. También necesito poder editar pagos ya validados para
> restablecerlos, en caso de que el usuario se equivoque: las personas con el permiso de editar
> pagos ya validados deben poder revertir dicha validación. Adicionalmente, desde la bandeja de
> validación quiero también editar y modificar el estado de validación de un pago con el permiso de
> editar pago. Igualmente, este tipo de acción de editar pago tiene que quedar registrada en
> auditoría.»

### 2. Requisitos vs. estado real (verificado en código y base)

| ID | Requisito | ¿Existe hoy? | Evidencia |
|---|---|---|---|
| **R1** | Botón para **restablecer los filtros** en pagos y en **cada** sección con filtros | **NO** | 14 secciones filtradas, **0** controles de reset. Grep de `limpiar\|restablecer\|clear\|reset` en `web/src/**/*.tsx` no devuelve ningún botón de filtros. |
| **R2** | **Revertir la validación** de un pago validado, con permiso dedicado | **SÍ — COMPLETO** | `POST /api/pagos/:id/revertir` + `requirePermiso('pagos.revertir_validacion')` (`pagos.routes.ts:88–93`); permiso **existente** en la tabla `permisos`; servicio `revertirPago()` (`pagos.service.ts:415–468`); botón «Revertir validación» con diálogo en `ValidacionPage.tsx` (gated por `tiene('pagos.revertir_validacion')`). |
| **R3** | **Editar los DATOS** de un pago **ya validado** (referencia, montos, fecha…) | **NO — bloqueado hoy; CONFIRMADO como pedido (D6)** | `editarPago()` responde **409** si `estado !== 'pendiente'` (`pagos.service.ts:274–276`); la UI solo ofrece «Editar» cuando `estado === 'pendiente'` (`MisPagosPage.tsx:135`). |
| **R4** | **Editar / modificar el estado** de validación **desde la bandeja** | **Parcial** | La bandeja ya cambia estado: validar, rechazar, marcar duplicado y revertir. **No** tiene ninguna acción «Editar». |
| **R5** | Permiso **«editar pago»** | **NO EXISTE** | La tabla `permisos` tiene 37 claves y **ninguna** es `pagos.editar`. Hoy `PUT /api/pagos/:id` se gobierna con `requirePermiso.some('pagos.reportar','pagos.ver_todos')` (`pagos.routes.ts:45–50`). |
| **R6** | **Registro en auditoría** de la edición | **SÍ — YA EXISTE** | `editarPago` audita `accion: 'editar'` (`pagos.service.ts:319–335`); `revertirPago` audita **dentro de la transacción** (`:452–462`); `subirSoporte` también (`:362–369`). |

**Conclusión de la verificación:** el pedido «revertir la validación de un pago validado» (**R2**) y
«dejar registro en auditoría» (**R6**) **ya están implementados y funcionando**. Lo genuinamente
nuevo es **R1** (reset de filtros), **R3** (editar datos de un pago validado) y **R4/R5** (acción de
edición en la bandeja con permiso propio).

---

### 3. R1 — Inventario de filtros (14 secciones, ninguna con reset)

Todas las secciones guardan el filtro en `useState` local (nada en la URL) y ya reinician la
paginación a la página 1 al cambiar un filtro.

| # | Archivo | Sección | Filtros |
|---|---|---|---|
| 1 | `web/src/features/pagos/MisPagosPage.tsx` | Mis pagos | Desde, Hasta, Referencia, Estado |
| 2 | `web/src/features/validacion/ValidacionPage.tsx` | Bandeja de validación | Desde, Hasta, Estado, Cobrador, Banco origen, Referencia, USD mín., USD máx. |
| 3 | `web/src/features/movimientos/MovimientosPage.tsx` | Movimientos bancarios | Desde, Hasta, Conciliación, Cuenta recaudadora, Referencia |
| 4 | `web/src/features/gastos/GastosPage.tsx` | Gastos | Desde, Hasta, Categoría, Autorizado por |
| 5 | `web/src/features/auditoria/AuditoriaPage.tsx` | Auditoría | Desde, Hasta, Usuario, Entidad, Acción |
| 6 | `web/src/features/auditoria/HistorialBcvTab.tsx` | Historial tasa BCV | Desde, Hasta |
| 7 | `web/src/features/reportes/ReportesPage.tsx` | Reportes (barra compartida por 9 pestañas) | Desde, Hasta, Cobrador, Banco, Estado |
| 8 | `web/src/features/configuracion/UsuariosTab.tsx` | Usuarios | Buscar, Rol, Estado |
| 9 | `web/src/features/configuracion/CobradoresTab.tsx` | Cobradores | Buscar, Estado |
| 10 | `web/src/features/configuracion/BancosTab.tsx` | Bancos | Buscar |
| 11 | `web/src/features/configuracion/CuentasTab.tsx` | Cuentas recaudadoras | Buscar, Banco, Estado |
| 12 | `web/src/features/configuracion/TiposPagoTab.tsx` | Tipos de pago | Buscar |
| 13 | `web/src/features/configuracion/TasasTab.tsx` | Tasas de referencia | Desde, Hasta |
| 14 | `web/src/features/configuracion/ParametrosTab.tsx` | Parámetros del sistema | Buscar |

**Hallazgos que definen el diseño:**

- **No existe ningún componente compartido de filtros** (ni `FilterBar`, ni `FilterPanel`, ni
  `DateRangePicker`). Cada página arma sus filtros a mano con `Input`/`Label`/`Select`.
- `DataTable` **no** ofrece nada para limpiar filtros: solo maneja orden y paginación de servidor.
  El reset **no** se puede delegar ahí.
- `PageHeader` tiene un slot `actions?: ReactNode` y hoy solo lo usan `ValidacionPage` y
  `GastosPage`: es el punto natural para montar el botón, pero **no** apliquemos 14 botones
  sueltos por copia-pega.

**Dos caminos (decidir en D5):**

| Opción | A favor | En contra |
|---|---|---|
| **(a) Primitivo compartido** — un hook `useFiltros`/componente `FiltroActions` que reciba el estado inicial y exponga «Limpiar», montado en el slot `actions` del `PageHeader` | Un solo lugar para el comportamiento y el estilo; 14 adopciones chicas; evita divergencia | Hay que tocar los 14 archivos igual, pero de forma uniforme |
| **(b) Botón manual por página** | Menos abstracción | 14 implementaciones que se van a desincronizar; el próximo filtro que se agregue se olvida |

### 4. R3 — Riesgo técnico de editar los datos de un pago validado

Esto **no** es simétrico con revertir la validación, y es el punto más delicado del pedido.

Cuando un pago está `validado` existe una fila en `conciliaciones` con
`diferenciaBs = pago.montoBs - movimiento.montoBs` **calculada al momento de validar**, y el
movimiento bancario quedó en `conciliado`. Si después se editan `montoBs`, `montoUsd` o
`referencia`:

- `diferenciaBs` queda **desactualizada** y deja de reflejar la diferencia real conciliada.
- La coincidencia que justificó la validación **puede dejar de ser válida** (por ejemplo, si el
  monto editado ya no está dentro de la tolerancia del movimiento vinculado).
- Los reportes y el dashboard, que suman sobre `pagos_reportados`, cambian **hacia atrás** sin que
  nadie lo note.

**Recomendación:** separar los dos casos.

1. **Corregir la validación** (equivocación de validación) → **ya existe**: revertir con
   `pagos.revertir_validacion`, que libera el movimiento y deja el pago listo para volver a
   validarse. No hace falta nada nuevo.
2. **Corregir los datos** de un pago validado → si se quiere permitir, debe ser explícito y con
   reglas: o bien **exige revertir primero**, o bien **recalcula `diferenciaBs` y revalida el
   vínculo** dentro de la misma transacción. Editar montos en silencio sobre una conciliación viva
   es corromper el dato con auditoría, pero igual corromperlo.

---

### 5. Criterios de aceptación (borrador)

- **CA-1:** Cada una de las 14 secciones con filtros ofrece un control visible de «Limpiar filtros»
  que vuelve todos los filtros a su valor inicial y reinicia la paginación a la página 1.
- **CA-2:** El control es uniforme (mismo texto, misma ubicación) en todas las secciones.
- **CA-3:** Si no hay ningún filtro activo, el control se muestra deshabilitado (o no se muestra).
- **CA-4:** La bandeja de validación expone una acción de edición gobernada por su permiso propio.
- **CA-5:** Toda edición o cambio de estado de un pago deja entrada en `auditoria` con `datosAntes`
  y `datosDespues`.
- **CA-6:** Un pago validado **no** puede quedar con datos inconsistentes respecto de su
  conciliación.
- **CA-7:** Una edición que **rompe** la coincidencia con el movimiento vinculado es **rechazada**
  (409) con un mensaje accionable; el pago y su conciliación quedan **intactos**.
- **CA-8:** Una edición que **no** rompe el match se aplica en caliente y recalcula
  `conciliaciones.diferenciaBs`.

---

### 6. Decisiones

| # | Pregunta | Estado |
|---|---|---|
| **D5** | ¿Reset con **primitivo compartido** (a) o **botón manual por página** (b)? | **DECIDIDA por criterio técnico (2026-09-20): (a) primitivo compartido.** Con 14 secciones, 14 botones copiados se desincronizan y el próximo filtro que se agregue se olvida. Se monta en el slot `actions` del `PageHeader`, que ya existe. Queda abierta a objeción del negocio. |
| **D6** | «Editar pagos ya validados»: ¿revertir la validación, editar los datos, o ambas? | **RESUELTA (2026-09-20).** **Las dos cosas**, como **dos acciones separadas** que comparten el mismo permiso de edición: (1) revertir la validación — **ya implementado**, y (2) editar los datos del pago. |
| **D7** | Si se permite editar datos de un validado: ¿**exige revertir primero** o **recalcula la conciliación**? | **RESUELTA (2026-09-20).** **Editar en caliente y recalcular**: se edita el pago validado sin revertir, y el backend recalcula `diferenciaBs` y revalida el vínculo del movimiento **dentro de la misma transacción**. |
| **D8** | El permiso «editar pago»: ¿se crea `pagos.editar` o se reutiliza `pagos.revertir_validacion`? | **RESUELTA POR IMPLICACIÓN (2026-09-20).** El pedido dice «el mismo permiso de edición» para ambas acciones, así que corresponde **crear `pagos.editar`**. Consecuencia: agregar la clave al array `PERMISOS` de `api/prisma/seed.ts` (los permisos se **siembran**, no requieren migración) → **38 permisos**; el rol Administrador la recibe automáticamente porque usa `ALL`. |
| **D9** | Si la edición en caliente **rompe** la coincidencia con el movimiento vinculado, ¿qué hace el sistema? | **RESUELTA (2026-09-20).** **Bloquear la edición** con **409** y un mensaje que indique revertir la validación primero. Ver §6.1. |

#### 6.1 Modelo elegido (D7): edición en caliente con recálculo

**Campos que afectan la conciliación** — editarlos obliga a re-evaluar el vínculo:

| Campo | Por qué afecta |
|---|---|
| `montoBs` | Cambia `diferenciaBs` y puede salirse de la tolerancia del movimiento. |
| `referencia` | Cambia el resultado del match (exacto / sufijo). |
| `fechaPago` | Puede salirse de la ventana de ±`match.date_window_days`. |
| `cuentaRecaudadoraId` | Rompe el invariante `movimiento.cuentaRecaudadoraId === pago.cuentaRecaudadoraId`. |

**Campos que NO afectan la conciliación:** `cliente`, `concepto`, `observaciones`, `tipoCobro`,
`tipoPagoId`, `bancoOrigenId`, `soporteUrl`.

**Recálculo (una sola transacción):**

1. Re-evaluar el vínculo con `movimientoBancoId` reutilizando la misma lógica del matcher
   (`calcularPuntaje`) con los datos **nuevos**.
2. **Si sigue siendo válido** → recalcular `conciliaciones.diferenciaBs` con el monto nuevo,
   mantener `estado = 'validado'`, y auditar `datosAntes` / `datosDespues`.
3. **Si deja de ser válido** → **bloquear la edición (D9)**: responder **409** con un mensaje que
   nombre el movimiento en conflicto e indique revertir la validación primero. **No** se desvincula
   en silencio ni se deja el pago `validado` con un vínculo roto.

**Consecuencia de negocio:** las correcciones que **no** rompen el match (`cliente`, `concepto`,
`observaciones`, o un `montoBs` que sigue dentro de la tolerancia) se aplican en caliente. Una
corrección que sí lo rompe **obliga** a pasar por revertir → editar → revalidar, que es exactamente
la «secuencia segura» que quedó documentada como alternativa descartada.

**Cuidado con el guard de la ruta (evita una regresión).** `PUT /api/pagos/:id` hoy usa
`requirePermiso.some('pagos.reportar','pagos.ver_todos')` (`pagos.routes.ts:45–50`). **No** se debe
reemplazar por `requirePermiso('pagos.editar')` a secas: eso rompería la edición que el **cobrador**
hace de sus propios pagos `pendiente`. La ruta se mantiene permisiva y el permiso elevado se exige
**dentro del servicio**: editar un pago con `estado !== 'pendiente'` requiere `pagos.editar`.

**Alternativa descartada** (queda documentada por si se quiere volver): exigir revertir primero,
aprovechando que las tres acciones ya existen.

```
pago validado  --[revertir]-->  pendiente  --[editar]-->  datos corregidos  --[revalidar]-->  validado
   (existe)                     (existe)      (existe)                          (existe)
```

---

### 7. Fuera de alcance

- No se implementó nada. **Cero** cambios en código, esquema o contratos.
- No se define el texto final ni el icono del control de reset.
- No se rediseña la bandeja de validación más allá de la acción de edición pedida.

> **Actualización (2026-09-20):** esta sección describía el estado **al redactar el pedido**. CR-002
> ya fue implementado (ver «Estado de implementación» arriba y CHANGELOG §8). Se mantiene aquí como
> registro de la decisión original. Nota de alcance real: la edición del diálogo se limita a
> `referencia`, `montoBs`, `montoUsd`, `cliente` y `concepto`, y **no** permite cambiar el `estado`
> del pago.

---

## CR-002 — Hallazgos de la auditoría (resueltos 2026-09-20)

Ronda de endurecimiento que cierra los hallazgos levantados al auditar CR-002. Detalle completo en
[`CHANGELOG.md`](./CHANGELOG.md) §10. **No** se agregaron endpoints: OpenAPI sigue en **100**
operaciones y Postman en **100** peticiones.

| Hallazgo | Estado | Evidencia (verificada en código/base) |
|---|---|---|
| Defecto de autorización: `pagos.ver_todos` (permiso de **lectura**) habilitaba escritura en `PUT /pagos/{id}` y `POST /pagos/{id}/soporte` | **Resuelto** | `api/src/modules/pagos/pagos.routes.ts`: ambas rutas exigen `requirePermiso.some('pagos.reportar','pagos.editar')`; `pagos.ver_todos` ya no concede escritura. |
| Brecha de permisos de `Administrativo` (no podía editar pagos validados ni revertir validaciones) | **Resuelto** | `api/prisma/seed.ts`: `Administrativo` suma `pagos.editar` y `pagos.revertir_validacion` → **19** permisos (SQL: Administrador 38, Administrativo 19, Cobrador 3, Consultor 10; total 38). |
| Monto inválido en pagos afloraba como **500** | **Resuelto** | `api/src/modules/pagos/pagos.schema.ts`: `decimalString` rechaza no numéricos y `<= 0` con `El monto debe ser un numero positivo` (**400**) en `reportarPagoSchema` y `editarPagoSchema`. |
| CVEs de `xlsx` (CVE-2023-30533 y CVE-2024-22363) | **Resuelto** | `api/package.json`: `xlsx` `0.20.3` desde el CDN oficial de SheetJS (confirmado en `package-lock.json`). |

### Hallazgo abierto (documentado, no corregido)

- **Helpers de dinero divergentes.** `api/src/modules/gastos/gastos.schema.ts` usa un helper `monto`
  distinto (regex que **permite `0`**), mientras `pagos.schema.ts` usa `decimalString` (positivo
  estricto). A diferencia de lo reportado inicialmente, esto **no** produce un 500:
  `gastos.service.ts` envuelve `calcularTasa` en un `try/catch` y responde **400** (verificado
  ejecutando `crear()` con montos en cero). La deuda real es de **consistencia**: unificar ambos
  helpers (mismo regex y mismo mensaje) para que el rechazo ocurra en el esquema y no en el
  servicio. Queda fuera de alcance de esta ronda.

> **Nota de historia:** el bloque §4 de CR-002 (arriba) describe el guard **anterior** de
> `PUT /api/pagos/:id` (`some('pagos.reportar','pagos.ver_todos')`); se conserva como registro
> histórico. El guard **vigente** es `some('pagos.reportar','pagos.editar')`.

---

## CR-003 — Plantilla descargable para la importación bancaria

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-20 |
| **Estado** | **IMPLEMENTADO (2026-09-20)** — ver «Estado de implementación» y [`CHANGELOG.md`](./CHANGELOG.md) §11 |
| **Solicitante** | Negocio (Dueño del proceso de cobros) |
| **Área** | Backend (`api/src/modules/importacion/`) + Frontend (`web/src/features/importacion/`) |
| **Impacto** | 1 endpoint nuevo, contrato de API (OpenAPI/Postman), UI de importación |

> **Estado de implementación (2026-09-20).** Implementado y verificado en el código y en vivo. A
> diferencia de CR-001 y CR-002 (que **no** agregaron endpoints), esta entrada **sí cambia los
> conteos de contrato**: OpenAPI **100 → 101** operaciones y Postman **100 → 101** peticiones. El
> detalle completo está en el [`CHANGELOG.md`](./CHANGELOG.md) §11.

### 1. Pedido textual

> «Que en el proceso de importación bancaria se pueda descargar una plantilla Excel para que los
> usuarios carguen el archivo en el formato correcto.»

### 2. Requisitos

| ID | Requisito |
|---|---|
| **R1** | Ofrecer una **plantilla Excel descargable** con el formato que espera el importador. |
| **R2** | La plantilla debe traer **exactamente 1 fila de ejemplo**, fácil de distinguir y de reemplazar/eliminar. |
| **R3** | Cargar la plantilla **sin modificar** (con la primera fila como encabezado) no debe producir errores de detección. |

### 3. Evidencia (verificada en código y en vivo)

| Afirmación | Evidencia |
|---|---|
| Endpoint `GET /api/importacion/plantilla` con permiso `movimientos.importar` | `api/src/modules/importacion/importacion.routes.ts`: `router.get('/plantilla', requirePermiso('movimientos.importar'), controller.plantilla)`. |
| Descarga `.xlsx` con nombre fijo | `api/src/modules/importacion/importacion.controller.ts`: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y `Content-Disposition: attachment; filename="plantilla-importacion-bancaria.xlsx"`. |
| Hoja `Movimientos`, encabezado en negrita y **1 fila de ejemplo** | `api/src/modules/importacion/importacion.service.ts` `generarPlantilla()` (ExcelJS): fila 1 `Referencia` \| `Monto en Bs` \| `Fecha de ejecución` en **bold**; fila 2 `EJEMPLO-0000` \| `0,01` \| `01/01/2000`. Leído del archivo descargado: hoja `Movimientos`, `rowCount = 2`. |
| Round-trip limpio con el valor por defecto de la UI | `POST /api/importacion/preview?cuentaRecaudadoraId=1&primeraFilaEsEncabezado=true` con el archivo → `{"filasTotales":1,"erroresDeteccion":0}`. La UI usa `primeraFilaEsEncabezado = true` por defecto (`web/src/features/importacion/ImportacionPage.tsx`). |
| Botón de descarga y aviso de la fila de ejemplo | `web/src/features/importacion/ImportacionPage.tsx` («Descargar plantilla» + aviso) y `web/src/api/importacion.ts` (`descargarPlantillaImportacion()`, vía el helper compartido `downloadFile()`). |
| La fila de ejemplo debe reemplazarse/eliminarse | Los **movimientos importados no se pueden eliminar** desde la aplicación: `api/src/modules/movimientos/movimientos.routes.ts` solo expone `GET /movimientos` y `GET /movimientos/:id`. |

### 4. Fuera de alcance

- No se agregó una hoja de instrucciones ni validación de columnas dentro de la plantilla.
- No se agregó una segunda pestaña con catálogos (bancos, cuentas recaudadoras).
- No se modificó el parser ni el formato aceptado por `POST /importacion/preview`/`confirmar`.

---

## CR-004 — Antigüedad de pagos en reportes, alerta de «documento viejo», baja definitiva con permiso propio y correcciones de UX

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-21 |
| **Estado** | **IMPLEMENTADO (2026-09-21)** — ver «Estado de implementación» y [`CHANGELOG.md`](./CHANGELOG.md) §13 |
| **Solicitante** | Negocio (Dueño del proceso de cobros) |
| **Área** | Reportes (`api/src/modules/reportes/`, `web/src/features/reportes/`), pagos/conciliación (`api/src/modules/pagos/`, `api/src/lib/classification.ts`), seguridad (`api/src/modules/usuarios|cobradores` + UI de Configuración) y UX (`ReportarPage`, `format.ts`) |
| **Impacto** | 2 endpoints nuevos, contrato de API (OpenAPI/Postman), 3 permisos nuevos, 4 migraciones de datos, UI de reportes, pagos y configuración |

> **Estado de implementación (2026-09-21).** Lote de **11 commits** (`bdb671b`…`8436d1b`) agrupado
> en cuatro frentes. El detalle completo está en el [`CHANGELOG.md`](./CHANGELOG.md) §13. Resumen
> verificado contra el código:
>
> - **Reportes:** fecha de ejecución del movimiento bancario por fila y filtro por esa fecha
>   (`fechaMovimientoDesde`/`fechaMovimientoHasta`), filtro por antigüedad (`antiguedadMaxDias`),
>   totales de no conciliados, fix del filtro de cobrador, y antigüedad en días + marca «Viejo»
>   (`antiguedadDias`, `esViejo`).
> - **Pagos/conciliación:** edición de `fechaPago` en el diálogo y alerta de «documento viejo»
>   (`alertaAntiguedadDias`) con permiso propio `pagos.ver_alerta_antiguedad`.
> - **Seguridad/datos:** baja **definitiva** con permiso propio para usuarios y cobradores
>   (`usuarios.eliminar_definitivo`, `cobradores.eliminar_definitivo`) y contraste de referencias por
>   los últimos **4** dígitos (`match.reference_suffix` 8 → 4).
> - **UX/infra:** buscador de cobrador con memoria del último usado y fix del corrimiento de un día
>   en columnas `DATE`.
>
> **Contrato y conteos (verificado):** OpenAPI **101 → 103** operaciones y Postman **101 → 103**
> peticiones (2 endpoints nuevos: `DELETE /usuarios/{id}/definitivo` y
> `DELETE /cobradores/{id}/definitivo`). Permisos **38 → 41** (Administrador los **41**;
> Administrativo **20**; Consultor **10**; Cobrador **3**). **4 migraciones nuevas, todas de datos**
> (permisos y catálogo de parámetros); **sin cambios de columnas ni tablas** (el único cambio en
> `schema.prisma` es un comentario del enum de acción de auditoría).

> **Dos commits del lote son continuación de trabajo ya documentado.** `58eeb44` **no** es una
> funcionalidad nueva: es un **refinamiento de CR-001** (documentado en [`CHANGELOG.md`](./CHANGELOG.md)
> §9). CR-001 introdujo el piso de contraste de **4 dígitos** (`MIN_DIGITOS_CONTRASTE`), pero dejó
> `match.reference_suffix` en **8**; este commit baja el sufijo configurado a **4** y lo lleva a
> producción con una migración. Se registra como **cambio de parámetro**, no se re-documenta.
> `f2bd31b` **sí** es funcionalidad nueva (baja definitiva de usuarios y cobradores, API + UI, con 2
> permisos y 2 endpoints): reutiliza el principio de borrado duro ya decidido para pagos (§3.1 del
> CHANGELOG), pero no lo repite. `316b848` es housekeeping documental —corrige un comentario de FK en
> `usuarios.service.ts`— y se registra en una línea.

### 1. Frentes y evidencia (verificado en código)

#### 1.1 Reportes

| Cambio | Evidencia |
|---|---|
| Fecha de ejecución del movimiento por fila + filtro | `api/src/modules/reportes/reportes.schema.ts` define `fechaMovimientoDesde`/`fechaMovimientoHasta` (opcionales); `reportes.service.ts` agrega `fechaMovimiento` a las filas de `cobros`. El filtro es **opt-in**: solo lo aplica `cobros` (`wherePagosPrisma(f, { conFechaMovimiento: true })`) para no vaciar `pendientes`/`pagos-sin-respaldo` ni cruzar ingresos con gastos en `flujo-caja`. |
| Filtro por antigüedad | `antiguedadMaxDias` (entero positivo) en `reportes.schema.ts`; conserva pagos con antigüedad **menor** a N días (borde **estricto**). Mismo camino opt-in que la fecha de movimiento. |
| Antigüedad en días + marca «Viejo» | `antiguedadEnDias()` y `esPagoViejo()` en `api/src/lib/classification.ts`; `camposAntiguedad()` en `reportes.service.ts` emite `antiguedadDias` (firmado: hoy = 0, fecha futura negativa) y `esViejo` (`antiguedadDias > umbral`, estricto). Se calculan al vuelo con el umbral vigente. |
| Totales de no conciliados | `movimientosNoConciliados()` devuelve `totales: { cantidad, totalBs }`, agregado con el **mismo** `where` que las filas. |
| Fix del filtro de cobrador | `web/src/features/reportes/ReportesPage.tsx` pide cobradores **activos** (`listarCobradores({ pageSize: 200, activo: true })`) y descarta los de `nombre` vacío. |

#### 1.2 Pagos / conciliación

| Cambio | Evidencia |
|---|---|
| Alerta de «documento viejo» | `alertaAntiguedadDocumento()` (`classification.ts`) devuelve los días completos entre `fechaPago` y la `fechaEjecucion` del movimiento vinculado, o `null` si no supera `umbralDias`. `serializePago()` (`pagos.service.ts`) emite `alertaAntiguedadDias` **siempre** (null sin permiso), resolviendo la config **una vez por request**. |
| Permiso propio de la alerta | `pagos.ver_alerta_antiguedad` en `api/prisma/seed.ts`, concedido a **Administrador** y **Administrativo**; el límite es **de servidor** (`puedeVerAlertaAntiguedad(user)`), no del frontend. |
| Edición de `fechaPago` | `web/src/features/pagos/EditarPagoDialog.tsx`: input `type="date"` sembrado desde la parte **UTC** del `DATE` (`fechaPagoInput()`), guardar deshabilitado si está vacío, y aviso de que la re-evaluación de la conciliación también usa la fecha de pago. |

#### 1.3 Seguridad / datos

| Cambio | Evidencia |
|---|---|
| Baja definitiva de usuarios | `DELETE /api/usuarios/{id}/definitivo` con `requirePermiso('usuarios.eliminar_definitivo')`; `removeDefinitivo()` cuenta bloqueos (`gastos`, `conciliaciones`, lotes, pagos validados y pagos del cobrador vinculado), rechaza **409** con el detalle y el auto-borrado con **400**; audita `borrar_definitivo` dentro de la transacción. |
| Baja definitiva de cobradores | `DELETE /api/cobradores/{id}/definitivo` con `requirePermiso('cobradores.eliminar_definitivo')`; `removeDefinitivo()` rechaza **409** si el cobrador tiene pagos reportados. |
| Contraste por últimos 4 dígitos | `match.reference_suffix` **8 → 4** en `api/prisma/seed.ts` y `MATCH_REFERENCE_SUFFIX` en `api/src/config/env.ts`; `MIN_DIGITOS_CONTRASTE = 4` sin cambios. |
| UI | Diálogos destructivos en `web/src/features/configuracion/UsuariosTab.tsx` y `CobradoresTab.tsx`. |

#### 1.4 UX / infra

| Cambio | Evidencia |
|---|---|
| Buscador de cobrador + memoria | `web/src/features/pagos/ReportarPage.tsx` reemplaza el `Select` por `Combobox` (filtra por código o nombre); persiste el último cobrador por usuario en `localStorage` (`gentioncobros:ultimoCobrador:<userId>`) y lo preselecciona al siguiente registro. |
| Fix del corrimiento de un día | `web/src/lib/format.ts` `parseCalendarDate()` extrae la parte de fecha y la ancla a medianoche **local**, de modo que una columna `DATE` no se corre en offsets UTC negativos; `MovimientosPage.tsx` pasa el `createdAt` (instante real) a `formatDateTime` con la etiqueta «Fecha de importación». |

### 2. Archivos de esta iteración

- **Reportes:** `api/src/modules/reportes/reportes.service.ts`,
  `api/src/modules/reportes/reportes.controller.ts`,
  `api/src/modules/reportes/reportes.schema.ts`, `web/src/features/reportes/ReportesPage.tsx`,
  `web/src/api/reportes.ts`, `web/src/types/index.ts`.
- **Pagos/conciliación:** `api/src/lib/classification.ts`,
  `api/src/modules/pagos/pagos.service.ts`, `api/tests/classification.test.ts`,
  `web/src/features/pagos/MisPagosPage.tsx`, `web/src/features/pagos/pago-utils.tsx`,
  `web/src/features/pagos/EditarPagoDialog.tsx`,
  `web/src/features/validacion/ValidacionPage.tsx`.
- **Seguridad/datos:** `api/prisma/seed.ts`, `api/src/lib/audit.ts`,
  `api/src/modules/usuarios/{usuarios.routes,usuarios.controller,usuarios.service}.ts`,
  `api/src/modules/cobradores/{cobradores.routes,cobradores.controller,cobradores.service}.ts`,
  `api/tests/eliminacion-definitiva.test.ts`, `api/src/config/env.ts`, `api/.env.example`,
  `web/src/api/{usuarios,cobradores}.ts`,
  `web/src/features/configuracion/{UsuariosTab,CobradoresTab}.tsx`.
- **UX/infra:** `web/src/features/pagos/ReportarPage.tsx`, `web/src/lib/format.ts`,
  `web/src/features/movimientos/MovimientosPage.tsx`.
- **Migraciones (4, de datos):**
  `api/prisma/migrations/20260921000000_permisos_eliminacion_definitiva/`,
  `api/prisma/migrations/20260921120000_conciliacion_sufijo_4/`,
  `api/prisma/migrations/20260921130000_parametros_catalogo/`,
  `api/prisma/migrations/20260921140000_permiso_alerta_antiguedad/`.
- **Contratos y docs:** `docs/openapi.yaml`, `docs/postman_collection.json`, los tres README,
  `CAMBIOS-SOLICITADOS.md` y [`CHANGELOG.md`](./CHANGELOG.md).

### 3. Fuera de alcance

- No se agregó paginación server-side a las tablas agregadas de reportes (§5.1 del CHANGELOG).
- La alerta de documento viejo **informa**; no bloquea ni cambia el estado del pago.
- No se persiste la antigüedad: `antiguedadDias`/`esViejo`/`alertaAntiguedadDias` se calculan al
  vuelo, sin columna, sin job y **sin cambios de esquema**.

> **Actualización (2026-09-21): CR-005 supera esta sección.** El cálculo de antigüedad y la alerta
> de «documento viejo» descritos arriba quedaron **reemplazados** por CR-005 (ver la entrada
> siguiente y [`CHANGELOG.md`](./CHANGELOG.md) §14): la base del cálculo pasa a ser la brecha contra
> el movimiento bancario, el comparador pasa a `>=`, la alerta se retira y el filtro por antigüedad
> se realinea contra el movimiento. Se conserva como historia de la decisión.

---

## CR-005 — Antigüedad determinada por el movimiento bancario y persistida al validar

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-21 |
| **Estado** | **IMPLEMENTADO (2026-09-21)** — ver «Estado de implementación» y [`CHANGELOG.md`](./CHANGELOG.md) §14 |
| **Solicitante** | Negocio (Dueño del proceso de cobros) |
| **Área** | Clasificación (`api/src/lib/classification.ts`), pagos/conciliación (`api/src/modules/pagos/`, `api/src/modules/conciliacion/`), reportes y dashboard (`api/src/modules/reportes/`, `api/src/modules/dashboard/`), esquema (`api/prisma/schema.prisma` + migración) y UI de validación (`web/src/features/validacion/`) |
| **Impacto** | Reescritura del cálculo de antigüedad (base, comparador y persistencia), 1 enum + 1 columna nullable, retiro de la alerta de la UI y del contrato, y campos aditivos; **sin endpoints nuevos** |

> **Estado de implementación (2026-09-21).** La antigüedad de un pago deja de derivarse al vuelo
> contra "hoy" y pasa a ser la brecha entre la `fechaPago` reportada por el cobrador y la
> `fechaEjecucion` del **movimiento bancario vinculado**, determinada y **persistida al validar**.
> El detalle completo está en el [`CHANGELOG.md`](./CHANGELOG.md) §14. Resumen verificado contra el
> código:
>
> - **Cálculo:** `antiguedadEnDias()` devuelve la brecha **firmada** en días completos (`0` = mismo
>   día; positivo = movimiento anterior = viejo; negativo = movimiento posterior). `esPagoViejo()`
>   usa `antiguedadDias >= umbralDias`. La antigua `alertaAntiguedadDocumento` fue **eliminada**.
> - **Persistencia:** enum `FuenteDerivacion { reporte, movimiento }` y columna nullable
>   `pagos_reportados.fuente_derivacion`; migración de **una sola sentencia** `ALTER TABLE`, **sin
>   backfill ni migración de datos**.
> - **Escritura (5 caminos):** `validarPago`, `validarLote` y `editarPago` (solo si cambia
>   `fechaPago` en un validado) persisten el veredicto desde el movimiento; `revertirPago` lo limpia;
>   `reportarPago` marca `fuenteDerivacion = 'reporte'` con la clasificación heredada.
> - **Lectura:** `reportes.service.ts` (resumen y evolución) y `dashboard.service.ts` leen el
>   veredicto persistido restringido a `fuente_derivacion = 'movimiento'`.
> - **Contrato y conteos (verificado):** **sin endpoints nuevos** — OpenAPI **103** operaciones y
>   Postman **103** peticiones (igual que antes de CR-005). Permisos **41** (sin cambios); el permiso
>   `pagos.ver_alerta_antiguedad` queda **huérfano** (sigue en la base/seed pero ya no lo lee la API
>   ni la UI).
>
> **Decisiones del dueño (2026-09-21), registradas explícitamente:**
>
> 1. **Visibilidad — opción (c):** el veredicto se muestra **en el toast de validación y en la
>    columna «Antigüedad»** de la bandeja, no en un badge de alerta aparte.
> 2. **Comparador y umbral:** la comparación final es `>=` ("N días o más = viejo"); el umbral queda
>    en el valor **`1`** ya configurado por el dueño y **NO** se migran datos (se descarta la
>    migración que bajaba `cobro.umbral_antiguedad_dias`).

### 1. Cálculo y veredicto (verificado en código)

| Hecho | Evidencia |
|---|---|
| Brecha firmada en días completos | `api/src/lib/classification.ts`: `antiguedadEnDias(fechaPago, fechaEjecucionMovimiento)` = `Math.floor((fechaPago - fechaEjecucionMovimiento) / 86_400_000)`. `0` = mismo día; positivo = movimiento anterior = pago viejo; negativo = movimiento posterior (nunca viejo). |
| Comparador final `>=` | `api/src/lib/classification.ts`: `esPagoViejo(antiguedadDias, umbralDias)` = `antiguedadDias >= umbralDias`. Con el umbral `1`, una brecha de 1 día **ya** es vieja; una brecha `0` no. |
| Alerta eliminada | `alertaAntiguedadDocumento` **ya no existe** en `classification.ts`. `clasificarPorAntiguedad` se conserva (compatibilidad) pero **no** alimenta el veredicto; solo la derivación heredada al reportar (`fuenteDerivacion = 'reporte'`). |
| Umbral sin migración | `cobro.umbral_antiguedad_dias` no se toca en la base (el dueño lo tiene en `1`); decisión explícita de **no** migrar datos. |

### 2. Esquema y migración

| Hecho | Evidencia |
|---|---|
| Enum nuevo | `api/prisma/schema.prisma` (línea 215): `enum FuenteDerivacion { reporte, movimiento }`. |
| Columna nueva | `api/prisma/schema.prisma` (línea 243): `fuenteDerivacion FuenteDerivacion? @map("fuente_derivacion")` en `PagoReportado`. |
| Migración | `api/prisma/migrations/20260921230918_antiguedad_movimiento_fuente/migration.sql`: una sola sentencia `ALTER TABLE \`pagos_reportados\` ADD COLUMN \`fuente_derivacion\` ENUM('reporte', 'movimiento') NULL`. **Sin backfill, sin migración de datos** (los pagos previos quedan en `NULL`). |

### 3. Escritura del veredicto (5 caminos, verificado en código)

| Camino | Evidencia |
|---|---|
| `validarPago` | `api/src/modules/conciliacion/conciliacion.service.ts:120-151`: deriva el veredicto desde el movimiento vinculado y lo persiste en el **mismo CAS** (`tipoCobroDerivado`, `fuenteDerivacion = 'movimiento'`, `revisarClasificacion`). |
| `validarLote` | `conciliacion.service.ts:338-360`: mismo criterio para la validación en lote. |
| `editarPago` | `api/src/modules/pagos/pagos.service.ts:486-493`: recalcula contra el movimiento vinculado **solo cuando cambia `fechaPago`** en un pago `validado` (y fija `fuenteDerivacion = 'movimiento'`). |
| `revertirPago` | `pagos.service.ts:659-663`: **limpia** `tipoCobroDerivado`, `fuenteDerivacion` y `revisarClasificacion` al liberar la conciliación. |
| `reportarPago` | `pagos.service.ts:199-201`: marca `fuenteDerivacion = 'reporte'` con la clasificación heredada de `fechaDocumento`. |

### 4. Consumidores (leen el veredicto persistido)

| Consumidor | Evidencia |
|---|---|
| Reporte nuevo vs. viejo | `reportes.service.ts` `nuevoViejo()` agrupa por `tipo_cobro_derivado` restringido a `fuente_derivacion = 'movimiento'` (`wherePagosSql(..., { soloFuenteMovimiento: true })`); un pago sin veredicto de movimiento queda **excluido**. |
| Dashboard | `api/src/modules/dashboard/dashboard.service.ts:214-231`: mismo criterio (`fuente_derivacion = 'movimiento'`), agrupando por `tipo_cobro_derivado`. |
| Payload de pago | `serializePago()` (`pagos.service.ts:82-87`) emite `antiguedadDias` **aditivo y nullable**: solo se calcula cuando `fuenteDerivacion === 'movimiento'` y existe la fecha del movimiento; en cualquier otro caso es `null`. |

### 5. Filtro por antigüedad realineado al movimiento

| Hecho | Evidencia |
|---|---|
| Filtro contra el movimiento | `reportes.service.ts` `condicionAntiguedadSql()`: `EXISTS (SELECT 1 FROM movimientos_banco mb WHERE mb.id = p. movimiento_banco_id AND DATEDIFF(p.fecha_pago, mb.fecha_ejecucion) < N)`; el borde sigue **estricto** (`< N`, "menor a N días"). |
| Pago sin movimiento excluido | El `EXISTS` correlacionado es falso sin movimiento vinculado, así que el pago **queda fuera** mientras el filtro está activo. |
| Campos de fila | `camposAntiguedad()` (`reportes.service.ts:296-309`): `antiguedadDias` firmado y `esViejo` con `>=`; sin movimiento vinculado emite `antiguedadDias: null` y `esViejo: false`. |

### 6. Retiro de la alerta y visibilidad del veredicto (UI)

| Hecho | Evidencia |
|---|---|
| Alerta retirada | `AlertaAntiguedadBadge` eliminado; ya no se usa en `ReportesPage.tsx`, `MisPagosPage.tsx` ni `ValidacionPage.tsx`; `alertaAntiguedadDias` fue removido de `web/src/types/index.ts`. |
| Permiso huérfano | `pagos.ver_alerta_antiguedad` **sigue** en `api/prisma/seed.ts` y en la base (41 permisos), pero la API y la UI ya no lo leen. El seed **no** se modifica. |
| Columna en la bandeja | `AntiguedadVeredicto` en `web/src/features/pagos/pago-utils.tsx`, montado como columna «Antigüedad» en `ValidacionPage.tsx` (líneas 479-481); muestra `—` cuando el pago no tiene veredicto de movimiento (p. ej. un `pendiente`). |
| Toast de validación | `descripcionVeredicto()` (`pago-utils.tsx`) alimenta el toast de `validarPago` (`ValidacionPage.tsx:213`): `Del día` / `Viejo (2 días)` / `Nuevo (N días)`. |

### 7. Verificación (2026-09-21)

- **Tests unitarios:** `api` → **109 passed / 10 archivos** (incluye `classification` con los casos
  borde de la brecha firmada y del comparador `>=`). `api` `build` **OK**; `web` `build` **OK**.
- **Integración:** **14 passed** (10 pre-existentes + **4** de CR-005 en
  `api/tests/integration/pagos.int.test.ts`: brecha vieja, mismo día, borde del umbral y ausencia de
  movimiento).
- **Permisos:** **41** en `api/prisma/seed.ts`, sin cambios por CR-005.
- **Contratos:** OpenAPI **103** operaciones y Postman **103** peticiones (**sin endpoints nuevos**).

### 8. Archivos

- **Backend:** `api/src/lib/classification.ts`, `api/src/modules/pagos/pagos.service.ts`,
  `api/src/modules/conciliacion/conciliacion.service.ts`,
  `api/src/modules/reportes/{reportes.service,reportes.controller}.ts`,
  `api/src/modules/dashboard/dashboard.service.ts`, `api/prisma/schema.prisma`,
  `api/prisma/seed-demo.ts`.
- **Migración:** `api/prisma/migrations/20260921230918_antiguedad_movimiento_fuente/` (1 columna,
  sin backfill).
- **Frontend:** `web/src/features/validacion/ValidacionPage.tsx`,
  `web/src/features/pagos/{pago-utils,MisPagosPage}.tsx`,
  `web/src/features/reportes/ReportesPage.tsx`, `web/src/types/index.ts`.
- **Tests:** `api/tests/classification.test.ts`, `api/tests/integration/pagos.int.test.ts`.
- **Contratos y docs:** `docs/openapi.yaml`, `docs/postman_collection.json`, los tres README,
  `CAMBIOS-SOLICITADOS.md` y [`CHANGELOG.md`](./CHANGELOG.md).

### 9. Fuera de alcance

- **Sin backfill ni migración de datos:** los pagos previos quedan con `fuente_derivacion = NULL` y
  no entran en los buckets de nuevo/viejo hasta validarse (o re-validarse).
- El permiso `pagos.ver_alerta_antiguedad` queda **huérfano** en la base y el seed; **no** se elimina
  (se documenta como tal).
- `clasificarPorAntiguedad` y la entrada opcional `fechaDocumento` se conservan por compatibilidad,
  pero **no** determinan el veredicto que leen los reportes.
- No se declararon en `docs/openapi.yaml` los parámetros de filtro `antiguedadMaxDias` ni
  `fechaMovimientoDesde`/`fechaMovimientoHasta` (ya ausentes antes de CR-005).
