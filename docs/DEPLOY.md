# Despliegue en producción con Dokploy

Este documento describe cómo desplegar el sistema (monorepo `api/` + `web/`) en un
VPS mediante **Dokploy** (Docker + autodeploy por `git push`).

La base de datos **MariaDB es externa**: no se levanta como servicio dentro del
`docker-compose.yml`.

## Arquitectura del stack

| Servicio | Origen | Imagen base | Puerto interno | Notas |
| --- | --- | --- | --- | --- |
| `api` | `api/Dockerfile` | `node:22.17-alpine` | `4000` | Aplica migraciones al arrancar; volumen persistente para uploads |
| `web` | `web/Dockerfile` | `nginxinc/nginx-unprivileged:1.27-alpine` | `8080` | SPA estática con fallback a `index.html` |

Dokploy enruta los dominios públicos hacia esos puertos (se configuran en la UI
de Dokploy). El compose **no publica puertos en el host**: el API sólo es
accesible a través del proxy.

---

## 1. Variables de entorno del servicio `api`

Configurar en Dokploy (Environment del servicio `api`).

| Variable | ¿Obligatoria? | ¿Secreto? | Valor / ejemplo |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Sí** | **Sí** | `mysql://USUARIO:PASSWORD@HOST_EXTERNO:3306/NOMBRE_BASE` |
| `JWT_ACCESS_SECRET` | **Sí** | **Sí** | Cadena aleatoria larga (mín. 32 bytes) |
| `JWT_REFRESH_SECRET` | **Sí** | **Sí** | Cadena aleatoria larga, **distinta** de la anterior |
| `CORS_ORIGIN` | **Sí** | No | URL pública del `web` (ver sección 3) |
| `NODE_ENV` | Recomendada | No | `production` |
| `PORT` | Recomendada | No | `4000` (debe coincidir con el puerto interno) |
| `UPLOAD_DIR` | Recomendada | No | `uploads` (**no cambiar**: debe coincidir con el volumen) |
| `JWT_ACCESS_TTL` | No | No | `15m` |
| `JWT_REFRESH_TTL` | No | No | `7d` |
| `MAX_LOGIN_ATTEMPTS` | No | No | `5` |
| `LOGIN_LOCK_MINUTES` | No | No | `15` |
| `BUSINESS_TIMEZONE` | No | No | `America/Caracas` |

> Si falta `DATABASE_URL`, `JWT_ACCESS_SECRET` o `JWT_REFRESH_SECRET`, el API
> **aborta el arranque** (`api/src/config/env.ts`).

---

## 2. Variables de build del servicio `web`

| Variable | ¿Obligatoria? | ¿Secreto? | Valor / ejemplo |
| --- | --- | --- | --- |
| `VITE_API_URL` | **Sí** (build arg) | No | `https://api.cobros.example.com/api` |

**Muy importante:** Vite inyecta `import.meta.env.VITE_API_URL` en el bundle
durante el **build** (`web/src/api/client.ts`). Si no se pasa, el código cae al
fallback `http://localhost:4000/api` y la web desplegada llamaría a `localhost`.
Por eso el `web/Dockerfile` **falla a propósito** si `VITE_API_URL` viene vacío.

Debe incluir el sufijo `/api`.

---

## 3. Consistencia de las dos URLs públicas (crítico)

Hay dos URLs que deben apuntarse mutuamente:

1. `CORS_ORIGIN` (API) debe incluir la URL pública del **web**.
   - Ejemplo: `CORS_ORIGIN=https://cobros.example.com`
   - Acepta varias separadas por coma: `https://cobros.example.com,https://www.cobros.example.com`
2. `VITE_API_URL` (web) debe apuntar a la URL pública del **API**, con `/api`.
   - Ejemplo: `VITE_API_URL=https://api.cobros.example.com/api`

Si cualquiera de las dos queda mal, el navegador bloqueará las peticiones por
CORS o llamará a la URL equivocada.

---

## 4. Persistencia de archivos subidos

Los comprobantes se guardan en disco dentro del contenedor del API
(`UPLOAD_DIR=uploads`, es decir `/app/uploads`). El compose monta el volumen
nombrado `gestion_cobros_api_uploads` en `/app/uploads` para que sobrevivan a
los redeploys. No borres ese volumen.

---

## 5. Migraciones de base de datos

El contenedor del API las aplica automáticamente al arrancar:

```
npx prisma migrate deploy && node dist/index.js
```

`prisma migrate deploy` es **idempotente**: es seguro reiniciar el contenedor
las veces que haga falta. No es necesario ningún comando manual.

Comando manual de respaldo (una sola vez, si hiciera falta):

```
docker compose run --rm api npx prisma migrate deploy
```

---

## 6. Bootstrap del administrador (seguro)

`prisma/seed.ts` crea usuarios de **desarrollo** con contraseñas conocidas
(`Admin123!`, etc.). **Nunca uses esas credenciales en producción.**

Para crear/reemplazar el administrador real se usa `api/prisma/create-admin.ts`,
que toma los datos de variables de entorno y **rechaza** contraseñas débiles o
de desarrollo.

Variables para el bootstrap:

| Variable | ¿Obligatoria? | ¿Secreto? | Descripción |
| --- | --- | --- | --- |
| `ADMIN_USERNAME` | No | No | Usuario (por defecto `admin`) |
| `ADMIN_EMAIL` | **Sí** | No | Correo del administrador |
| `ADMIN_PASSWORD` | **Sí** | **Sí** | Mínimo 12 caracteres; no puede ser un default de desarrollo |
| `ADMIN_NOMBRE_COMPLETO` | No | No | Nombre a mostrar |

Reglas de rechazo (falla ruidosamente, sin tocar la base de datos):

- `ADMIN_PASSWORD` ausente o vacío.
- Longitud menor a 12 caracteres.
- Igual a un default de desarrollo conocido (`Admin123!`, `Admin12345`,
  `Cobrador123!`, `NuevaClave123`) o que empiece con `change-me`.

### Secuencia recomendada en una base nueva

El rol `Administrador` y los permisos los crea el seed del modelo de seguridad
(las migraciones sólo crean las tablas). Por eso, en una base de datos nueva:

1. Aplicar migraciones (automático al arrancar el API).
2. Cargar el modelo de seguridad y catálogos: `npm run seed`.
3. **Inmediatamente** fijar la contraseña real del admin: `npm run create-admin`.
4. Eliminar o desactivar los usuarios demo creados por el seed
   (`administrativo`, `cobrador1`, `cobrador2`, `consultor`).

> Nota: el seed es una herramienta de desarrollo/demo. Si se ejecuta en
> producción, hazlo sólo para provisionar roles/permisos/catálogos y ejecuta
> `create-admin` a continuación para no dejar el admin con la clave por defecto.

### Cómo ejecutarlo

En desarrollo (con `tsx`):

```
npm run create-admin
```

Dentro del contenedor de producción (sólo hay JS compilado, no `tsx`):

```
docker compose exec api node dist/prisma/create-admin.js
```

En ambos casos se pasan `ADMIN_EMAIL` y `ADMIN_PASSWORD` por entorno. No
escribas la contraseña en el repositorio.

---

## 7. Resumen del flujo de despliegue

1. Crear la base MariaDB externa y un usuario con permisos sobre ella.
2. En Dokploy: crear el stack desde el repositorio (`docker-compose.yml`).
3. Definir las variables de entorno del `api` y el build arg `VITE_API_URL` del `web`.
4. Configurar los dominios públicos (web → 8080, api → 4000) en Dokploy.
5. Deploy. El API aplica migraciones y arranca; el web sirve la SPA.
6. En una base nueva: `npm run seed` y luego `npm run create-admin`.
7. Verificar `https://api.<dominio>/health` (debe responder `{"status":"ok"}`).
