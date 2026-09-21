# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Web - React + Vite static SPA, served by nginx as a non-root user.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Build stage.
# ---------------------------------------------------------------------------
FROM node:22.17-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# CRITICAL - Vite inlines `import.meta.env.VITE_API_URL` into the bundle at
# BUILD time (see web/src/api/client.ts, which falls back to
# `http://localhost:4000/api` when it is unset). The value cannot be changed at
# runtime, so it MUST be supplied here as a build arg. We fail the build when it
# is missing so the deployed SPA can never silently call localhost.
ARG VITE_API_URL
RUN test -n "$VITE_API_URL" || (echo "ERROR: build arg VITE_API_URL is required (e.g. https://api.example.com/api)" >&2 && exit 1)
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage: nginx, non-root (the unprivileged image listens on 8080).
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# SPA routing: try_files ... /index.html so deep links like /pagos/12 are served
# by the SPA instead of returning 404 (react-router handles them client-side).
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
