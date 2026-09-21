# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# API - Express + TypeScript + Prisma (MariaDB/MySQL).
#
# Multi-stage build. No secret is ever baked into the image: every credential
# is read from the environment at container start.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Build stage: full dependencies + prisma generate + TypeScript compile.
# ---------------------------------------------------------------------------
FROM node:22.17-alpine AS builder

# Prisma's engines need OpenSSL on Alpine.
RUN apk add --no-cache openssl

WORKDIR /app

# Install ALL dependencies (dev included) so prisma generate and tsc are available.
COPY package.json package-lock.json ./
RUN npm ci

# Prisma needs the schema present before it can generate the client.
COPY prisma ./prisma
RUN npx prisma generate

# Compile TypeScript -> dist/.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage: production dependencies only, non-root.
# ---------------------------------------------------------------------------
FROM node:22.17-alpine AS runtime

RUN apk add --no-cache openssl

ENV NODE_ENV=production
# The generated client is copied below; skip the client postinstall generate.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

WORKDIR /app

# Production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled application.
COPY --from=builder /app/dist ./dist

# `tsc -p tsconfig.json` emits `dist/src/index.js` (the tsconfig includes both
# `src/**` and `prisma/**` with rootDir "."), while api/package.json#main points
# at `dist/index.js`. Add the documented entry point as a symlink; Node resolves
# it to its real path so relative requires keep working.
RUN ln -sf src/index.js dist/index.js

# Prisma schema + migrations, required by `prisma migrate deploy`.
COPY --from=builder /app/prisma ./prisma

# Generated Prisma client.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# The `prisma` CLI is a devDependency, but it is required to run migrations at
# boot. Copy it (plus the @prisma/* packages it depends on) from the builder and
# recreate the .bin shim so `npx prisma` resolves locally instead of downloading.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
RUN ln -sf ../prisma/build/index.js node_modules/.bin/prisma

# Uploaded receipts are written here; mount a volume to persist them.
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node

ENV PORT=4000
EXPOSE 4000

# Apply pending migrations (idempotent, safe to run on every boot) and serve.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
