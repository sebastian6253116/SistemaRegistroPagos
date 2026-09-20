# Web — Sistema de Gestión de Cobros

Frontend SPA en **React 18 + TypeScript + Vite** con TanStack Query/Table, React Hook Form +
Zod, Tailwind CSS y react-router. La documentación completa del proyecto está en el
[`README.md`](../README.md) de la raíz.

## Requisitos

- Node.js 18+ (probado con v22)
- El backend (`api/`) corriendo en `http://localhost:4000`

## Instalación y ejecución

```powershell
npm install
Copy-Item .env.example .env      # VITE_API_URL=http://localhost:4000/api
npm run dev                      # http://localhost:5173
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Compila la SPA a `dist/` |
| `npm run preview` | Sirve el build de producción localmente |

## Pantallas

`/login` · `/forgot-password` · `/reset-password` · `/dashboard` · `/reportar` (cobrador,
mobile-first) · `/mis-pagos` · `/validacion`
(bandeja con coincidencias y validación en lote) · `/movimientos` · `/importacion` · `/gastos` ·
`/reportes` (9 informes, exportación Excel/PDF) · `/configuracion` · `/auditoria`.

- **Configuración** organiza sus secciones en pestañas: Usuarios, Roles, Cobradores, Bancos,
  Cuentas recaudadoras (con acción «fijar como predeterminada»), **Tipos de pago** (CRUD y
  predeterminado), Tasas de referencia, **Tasa BCV** y Parámetros.
- **Auditoría** también usa pestañas: «Registro de auditoría» (sin cambios) e «Historial tasa BCV».

## Tema (modo oscuro)

Claro por defecto; el usuario lo alterna desde el encabezado. Se persiste en `localStorage`
(`gc.theme`) y un script en línea en `index.html` aplica el tema antes del primer render para
evitar el destello. Las paletas clara y oscura son variables CSS.

## Notificaciones

El encabezado incluye una campana con contador de no leídas y un panel que se consulta cada 60 s
(no hay websockets). Cada aviso puede marcarse como leído, y «Marcar todas como leídas» limpia el
contador. Al abrir un aviso de un pago, redirige a la bandeja de validación o a «Mis pagos» según
los permisos del usuario.

## Registro de pagos: selector y comprobante

- **Banco de origen** usa un `Combobox` (dropdown con búsqueda, insensible a acentos, navegable
  por teclado y con ARIA).
- El **banco de origen** es **condicionalmente obligatorio**: la regla
  `pago.banco_origen_obligatorio` llega en `reglas: { bancoOrigenObligatorio }` de
  `GET /catalogos/form-pago`. Con la regla activa el formulario lo exige; con la regla
  desactivada puede quedar sin seleccionar y el pago se guarda sin banco.
- Cuando un pago no tiene banco, la API no devuelve `null` en `bancoOrigen` sino
  `{ id: null, nombre: "N/A", codigo: "N/A" }`; la UI renderiza ese literal **`N/A`** (además del
  `?? 'N/A'` defensivo que ya usa en tablas y tarjetas).
- La **cuenta recaudadora** y el **tipo de pago** se preseleccionan con los valores configurados
  como predeterminados.
- El **tipo de pago** es obligatorio.
- Se puede adjuntar un **comprobante** (imagen o PDF, máximo 5 MB). El pago se guarda primero y el
  comprobante se sube después; si la subida falla se informa «pago guardado, comprobante no
  cargado».

## Descarga y previsualización de soportes

El backend ya no sirve `uploads/` de forma pública: los archivos se descargan por
`GET /api/uploads/:filename`, que exige token y autoriza por archivo. Por eso la SPA **no** puede
usar un `<a href>` directo (el JWT vive en `localStorage` y lo agrega el interceptor de axios).

- `obtenerArchivoPrivado(soporteUrl)` (`src/api/client.ts`) pide el archivo con el cliente axios
  compartido (`responseType: 'blob'`), de modo que se adjuntan el `Bearer` y el refresco de 401.
  El `soporteUrl` guardado (`/uploads/<archivo>`) se pasa tal cual y el `baseURL` resuelve
  `/api/uploads/<archivo>`. Si el backend devuelve un error JSON dentro del blob, se extrae y se
  propaga su mensaje.
- `FilePreviewDialog` (`src/components/common/FilePreviewDialog.tsx`) recibe el `soporteUrl`,
  obtiene el blob y lo muestra: **imagen** incrustada, **PDF** en un `iframe`, o un estado de
  «no previsualizable» con descarga. Maneja **carga**, **error con reintento** y **descarga**
  (crea un object URL efímero), y ofrece «Abrir en pestaña nueva» sin bloqueo de popups (el object
  URL ya existe al momento del clic).
- Se **eliminaron** el helper `resolveUploadUrl` y la constante `UPLOAD_URL`; ninguna vista
  construye ya URLs públicas de `uploads`.

## Importación bancaria: plantilla descargable

- La tarjeta **«Cargar archivo»** de `/importacion` incluye un botón **«Descargar plantilla»** que
  llama a `descargarPlantillaImportacion()` (`src/api/importacion.ts`). Esa función usa el helper
  compartido `downloadFile()` (`src/api/client.ts`), que adjunta el `Bearer` y guarda el archivo con
  el nombre que indica el `Content-Disposition` del servidor
  (`plantilla-importacion-bancaria.xlsx`).
- La tarjeta muestra además un aviso: la **fila de ejemplo** de la plantilla debe **reemplazarse o
  eliminarse** antes de importar, porque los **movimientos importados no se pueden eliminar** desde
  la aplicación.
- La casilla **«La primera fila es encabezado»** viene **marcada** por defecto
  (`primeraFilaEsEncabezado = true`), que es la lectura correcta de la plantilla.

## Bandeja de validación y atajos

Muestra el comprobante («Ver comprobante») y el tipo de pago del pago activo, y marca con un
indicador las filas que tienen comprobante. Atajos (desactivados mientras se escribe en un campo):

| Tecla | Acción |
|---|---|
| `J` / `K` | Siguiente / anterior fila |
| `Enter` | Validar con la mejor coincidencia |
| `A` | Aprobar el pago activo (mejor coincidencia) |
| `R` | Rechazar el pago activo |

### Filtro por estado y acciones de pago

- La bandeja incluye un **filtro por estado** (Pendiente, Validado, Rechazado, Duplicado) que
  reposiciona la lista; por defecto muestra los **pendientes**.
- **Eliminar un pago no validado** (permiso `pagos.eliminar`): disponible en la bandeja y en «Mis
  pagos» para pagos en estado distinto de `validado`. Pide confirmación advirtiendo que es
  permanente e irreversible y que solo quedará una copia en la auditoría.
- **Revertir la validación** (permiso `pagos.revertir_validacion`): disponible sobre un pago
  `validado` (en la fila y en el panel del pago activo). Permite elegir el estado destino
  (`pendiente` o `rechazado`); si se elige `rechazado`, el **motivo es obligatorio** (mínimo 3
  caracteres). Al revertir, el movimiento bancario vuelve a quedar disponible para conciliar.
- **Editar pago** (permiso `pagos.editar`): la bandeja expone una acción «Editar pago» sobre pagos
  `pendiente` y `validado`, mediante el diálogo compartido `EditarPagoDialog`. Sobre un pago
  `validado` avisa que la conciliación se re-evalúa al guardar: si la edición rompe la coincidencia
  con el movimiento, el backend responde **409** y no se aplica (hay que revertir la validación
  primero). El mismo diálogo se reutiliza en «Mis pagos» (`MisPagosPage`), cuyo gate es más fino:
  un pago `pendiente` es editable con `pagos.reportar` **o** `pagos.editar` (así el cobrador edita
  los propios), mientras que un pago `validado` solo es editable con `pagos.editar`.

### Aviso de duplicado (CR-001)

- Si el pago activo coincide con un movimiento bancario **ya conciliado con otro pago**,
  `GET /pagos/:id/coincidencias` devuelve la señal aditiva `duplicado` y el panel muestra un
  aviso **«Posible duplicado»** prominente (`role="alert"`), con la referencia y el monto del
  movimiento y el id del pago con el que ya está conciliado.
- Ese aviso **intercepta la validación automática**: el botón «Validar» y los atajos `Enter`/`A`
  no disparan la petición automática (que respondería **409**); en su lugar muestran un aviso
  que invita a la vía manual.
- **Salida manual:** «Validar con este movimiento» sobre cada coincidencia de `data`,
  «Rechazar» o «Marcar como duplicado». El pago permanece `pendiente` hasta que el validador
  decida.
- La **validación en lote** también informa los duplicados: los lista como errores («… por
  posible duplicado y requieren validación manual») y no los valida.

### Limpiar filtros

Todas las secciones con filtros (14 en total) incorporan un control compartido **«Limpiar filtros»**
(`web/src/components/common/ClearFiltersButton.tsx`) montado junto a los campos de filtro:

- Devuelve **todos** los filtros a su valor inicial y **reinicia la paginación a la página 1**.
- Se muestra **deshabilitado** cuando no hay ningún filtro activo; la detección es por **valor**
  (firma estable, no por identidad de objeto), de modo que reescribir un filtro con el mismo valor no
  lo marca como activo.
- El primitivo se compone de `useActiveFilters(current, initial)` (booleano) y
  `<ClearFiltersButton current initial onClear />`, en lugar de 14 botones copiados que se
  desincronizan. Se adoptó en Mis pagos, Validación, Movimientos, Gastos, Auditoría, Historial BCV,
  Reportes y las pestañas de Configuración (Usuarios, Cobradores, Bancos, Cuentas, Tipos de pago,
  Tasas y Parámetros).

## Reportes: paginación

Cada tabla principal de `/reportes` solicita **50 filas por página** (`REPORT_PAGE_SIZE = 50`) y
pasa el `meta` del servidor (`page`, `pageSize`, `total`, `totalPages`) a los controles de
paginación de `DataTable`, de modo que se puede recorrer **todo** el resultado, no solo la primera
ventana (antes se pedían 20 filas y se ignoraba el `meta`). Al cambiar cualquier filtro o de
pestaña, la página vuelve a 1.

**Limitación conocida:** las dos tablas agregadas secundarias — **Análisis de tasa → Por cobrador**
y **Gastos → Por autorizante** — **no** están paginadas del lado del servidor: esas sub-consultas
no devuelven `meta`, así que muestran su conjunto de resultados completo.

## Responsive (móvil)

`DataTable` acepta un `mobileCard` opcional: cuando se provee, bajo el breakpoint `sm` la tabla se
reemplaza por **tarjetas apiladas** con etiquetas legibles y las acciones de fila (editar,
eliminar, validar); por encima de `sm` se mantiene la tabla. Todas las tablas de la aplicación
(validación, mis pagos, gastos, movimientos, importación, reportes, configuración y auditoría)
proveen `mobileCard`, de modo que en móvil ninguna depende del desplazamiento horizontal. Si se
omitiera, la tabla conservaría ese desplazamiento. La paginación se comparte entre ambos modos y
las tarjetas respetan el orden de la tabla. En la bandeja de validación, al elegir una tarjeta en
móvil la vista se desplaza al panel de coincidencias.

## Autenticación y permisos

El `accessToken` se adjunta como `Bearer`; ante un `401` se renueva una vez con el
`refreshToken` y se reintenta. El menú y las rutas se filtran por los permisos del usuario
(`usePermiso`, `<RequierePermiso>`, `ProtectedRoute`), de modo que un cobrador no ve
configuración ni auditoría y un consultor solo ve dashboard y reportes en modo lectura.

Permisos que habilitan las acciones sobre pagos: **`pagos.eliminar`** (eliminar un pago no
validado), **`pagos.revertir_validacion`** (revertir un pago validado) y **`pagos.editar`**
(editar los datos de un pago validado y habilitar la acción «Editar pago» en la bandeja). El seed
los concede al rol **Administrador**; se pueden asignar a otros roles desde Configuración → Roles.

## Usuarios de prueba

Ver la sección 6 del [README raíz](../README.md). Resumen: `admin` / `administrativo` /
`consultor` usan `Admin123!`; `cobrador1` y `cobrador2` usan `Cobrador123!`.
