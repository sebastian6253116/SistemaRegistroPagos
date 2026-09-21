# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Single-service image: the Express API also serves the built React SPA from
# the SAME origin (no nginx, no separate frontend container, no CORS).
#
# Build context is the REPO ROOT (see docker-compose.yml), so `web/` and
# `api/` are both available. No secret is ever baked in: every credential is
# read from the environment at container start.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Stage 1: build the web SPA.
# ---------------------------------------------------------------------------
FROM node:22.17-alpine AS web-builder

WORKDIR /web

# Install web dependencies with a cache-friendly layer.
COPY web/package.json web/package-lock.json ./
RUN npm ci

# Source (node_modules/dist are excluded by the root .dockerignore).
COPY web/ ./

# CRITICAL - Vite inlines `import.meta.env.VITE_API_URL` into the bundle at
# BUILD time. It is fixed to a RELATIVE `/api` so the SPA calls the same origin
# it was served from: no public URL is baked in and no CORS is involved.
ENV VITE_API_URL=/api
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: build the API (TypeScript -> dist, generated Prisma client).
# ---------------------------------------------------------------------------
FROM node:22.17-alpine AS api-builder

# Prisma's engines need OpenSSL on Alpine.
RUN apk add --no-cache openssl

WORKDIR /api

# Install ALL dependencies (dev included) so prisma generate and tsc run.
COPY api/package.json api/package-lock.json ./
RUN npm ci

# Prisma needs the schema present before it can generate the client.
COPY api/prisma ./prisma
RUN npx prisma generate

# Compile TypeScript -> dist/.
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: runtime, production dependencies only, non-root.
# ---------------------------------------------------------------------------
FROM node:22.17-alpine AS runtime

RUN apk add --no-cache openssl

ENV NODE_ENV=production
# The generated client is copied below; skip the client postinstall generate.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

WORKDIR /app

# Production dependencies only.
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled application.
COPY --from=api-builder /api/dist ./dist

# `tsc -p tsconfig.json` emits `dist/src/index.js` (the tsconfig includes both
# `src/**` and `prisma/**` with rootDir "."), while api/package.json#main points
# at `dist/index.js`. Add the documented entry point as a symlink; Node resolves
# it to its real path so relative requires keep working.
RUN ln -sf src/index.js dist/index.js

# Prisma schema + migrations, required by `prisma migrate deploy`.
COPY --from=api-builder /api/prisma ./prisma

# Generated Prisma client.
COPY --from=api-builder /api/node_modules/.prisma ./node_modules/.prisma

# The `prisma` CLI is a devDependency, but it is required to run migrations at
# boot. Copy it (plus the @prisma/* packages it depends on) from the builder and
# recreate the .bin shim so `npx prisma` resolves locally instead of downloading.
COPY --from=api-builder /api/node_modules/prisma ./node_modules/prisma
COPY --from=api-builder /api/node_modules/@prisma ./node_modules/@prisma
RUN ln -sf ../prisma/build/index.js node_modules/.bin/prisma

# Built SPA, served by the API. WEB_DIST_DIR points exactly here.
COPY --from=web-builder /web/dist ./web/dist
ENV WEB_DIST_DIR=/app/web/dist

# Uploaded receipts are written here; mount a volume to persist them.
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node

ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

# Apply pending migrations (idempotent, safe on every boot) and serve both the
# API and the SPA on the same port.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
