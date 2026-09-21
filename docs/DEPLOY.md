# Despliegue en producción con Dokploy

Este documento describe cómo desplegar el sistema (monorepo `api/` + `web/`) en
un VPS mediante **Dokploy** (Docker + autodeploy por `git push`).

El sistema se despliega como **un único servicio**: una sola imagen, un solo
puerto interno y **un solo dominio**. El API de Express sirve la SPA de React
ya compilada desde el **mismo origen**, así que no hay contenedor de nginx ni
peticiones cross-origin (CORS) entre frontend y backend.

La base de datos **MariaDB es externa**: no se levanta como servicio dentro del
`docker-compose.yml`.

## Arquitectura del stack

| Servicio | Origen | Imagen base | Puerto interno | Notas |
| --- | --- | --- | --- | --- |
| `app` | `Dockerfile` (raíz del repo) | `node:22.17-alpine` | `4000` | Sirve el API y la SPA compilada; aplica migraciones al arrancar; volumen persistente para uploads |

El `Dockerfile` está en la **raíz del repositorio** y su **contexto de build es
la raíz del repo** (`./`), porque necesita tanto `api/` como `web/`.

Dokploy enruta **un único dominio público** hacia el puerto interno `4000` (se
configura en la UI de Dokploy). El compose **no publica puertos en el host**: el
servicio sólo es accesible a través del proxy de Dokploy.

---

## 1. Variables de entorno del servicio `app`

Configurar en Dokploy (Environment del servicio `app`).

| Variable | ¿Obligatoria? | ¿Secreto? | Valor / ejemplo |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Sí** | **Sí** | `mysql://USUARIO:PASSWORD@HOST_EXTERNO:3306/NOMBRE_BASE` |
| `JWT_ACCESS_SECRET` | **Sí** | **Sí** | Cadena aleatoria larga (mín. 32 bytes) |
| `JWT_REFRESH_SECRET` | **Sí** | **Sí** | Cadena aleatoria larga, **distinta** de la anterior |
| `NODE_ENV` | Recomendada | No | `production` |
| `PORT` | Recomendada | No | `4000` (debe coincidir con el puerto interno y con el dominio de Dokploy) |
| `WEB_DIST_DIR` | Recomendada | No | `/app/web/dist` (ruta de la SPA compilada dentro de la imagen; ya viene fijada en el `Dockerfile` y el compose) |
| `UPLOAD_DIR` | Recomendada | No | `uploads` (**no cambiar**: debe coincidir con el volumen) |
| `CORS_ORIGIN` | No | No | Déjala vacía o con el dominio público. **Ya no es crítica**: la SPA llama al mismo origen y no dispara CORS. Sólo aplica a clientes externos que llamen al API cross-origin |
| `JWT_ACCESS_TTL` | No | No | `15m` |
| `JWT_REFRESH_TTL` | No | No | `7d` |
| `MAX_LOGIN_ATTEMPTS` | No | No | `5` |
| `LOGIN_LOCK_MINUTES` | No | No | `15` |
| `BUSINESS_TIMEZONE` | No | No | `America/Caracas` |

> Si falta `DATABASE_URL`, `JWT_ACCESS_SECRET` o `JWT_REFRESH_SECRET`, el API
> **aborta el arranque** (`api/src/config/env.ts`).

### Ya NO se necesita `VITE_API_URL`

En el despliegue anterior (dos servicios) el frontend se compilaba con un
`VITE_API_URL` como *build arg* apuntando a la URL pública del API. Eso ya no
existe:

- La SPA se compila con `VITE_API_URL=/api`, una ruta **relativa**.
- Al servirse desde el mismo origen, `/api` resuelve contra el mismo dominio en
  el que está la SPA.
- No hay ninguna URL pública *horneada* en el bundle y no hay que configurar
  nada por entorno para el frontend.

---

## 2. Un único origen (sin CORS)

API y SPA comparten origen y puerto:

- `GET /` y las rutas del router (por ejemplo `/pagos/12`) devuelven el
  `index.html` de la SPA (fallback para *deep links* de react-router).
- `GET /api/...` atiende el API REST. Un `/api/...` inexistente sigue
  respondiendo un **404 JSON** (nunca el HTML de la SPA).

Como el navegador habla con el mismo dominio, no se producen peticiones
cross-origin para la SPA; por eso `CORS_ORIGIN` deja de ser crítica.

### Content Security Policy

El API aplica `helmet` con una CSP explícita que permite la SPA servida desde
el mismo origen: el *script inline* de tema de `index.html`, los assets de
Vite, las previsualizaciones (`blob:`/`data:`) y las llamadas al propio API.
Ver los comentarios de cada directiva en `api/src/app.ts`.

---

## 3. Persistencia de archivos subidos

Los comprobantes se guardan en disco dentro del contenedor
(`UPLOAD_DIR=uploads`, es decir `/app/uploads`). El compose monta el volumen
nombrado `gestion_cobros_api_uploads` en `/app/uploads` para que sobrevivan a
los redeploys. No borres ese volumen.

---

## 4. Migraciones de base de datos

El contenedor aplica las migraciones automáticamente al arrancar:

```
npx prisma migrate deploy && node dist/index.js
```

`prisma migrate deploy` es **idempotente**: es seguro reiniciar el contenedor
las veces que haga falta. No es necesario ningún comando manual.

Comando manual de respaldo (una sola vez, si hiciera falta):

```
docker compose run --rm app npx prisma migrate deploy
```

---

## 5. Bootstrap del administrador (seguro)

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
docker compose exec app node dist/prisma/create-admin.js
```

En ambos casos se pasan `ADMIN_EMAIL` y `ADMIN_PASSWORD` por entorno. No
escribas la contraseña en el repositorio.

---

## 6. Resumen del flujo de despliegue

1. Crear la base MariaDB externa y un usuario con permisos sobre ella.
2. En Dokploy: crear la aplicación tipo Compose desde el repositorio
   (`docker-compose.yml`). Dockerfile por defecto: `./Dockerfile`; contexto de
   build: la raíz del repo.
3. Definir las variables de entorno del servicio `app` (ver sección 1). No hay
   build args de frontend.
4. Configurar **un único dominio** público apuntando al puerto interno `4000`
   en Dokploy.
5. Deploy. El contenedor aplica migraciones y arranca sirviendo API + SPA.
6. En una base nueva: `npm run seed` y luego `npm run create-admin`.
7. Verificar `https://<dominio>/health` (debe responder `{"status":"ok"}`).
