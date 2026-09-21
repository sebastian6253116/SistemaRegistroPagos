import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import apiRouter from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

/**
 * Content Security Policy for the SPA served from this same origin.
 *
 * The built React app is served by this API, so the policy has to cover both
 * the JSON API and the browser bundle. `useDefaults: false` keeps the list
 * explicit and reviewable instead of silently inheriting Helmet's defaults.
 */
const contentSecurityPolicy = {
  useDefaults: false,
  directives: {
    // Baseline for any fetch directive not listed below: same origin only.
    'default-src': ["'self'"],
    // A crafted injection must not be able to retarget relative URLs via <base>.
    'base-uri': ["'self'"],
    // Vite emits fonts locally; `data:` covers any inlined font payload.
    'font-src': ["'self'", 'data:'],
    // Forms may only post back to this same origin.
    'form-action': ["'self'"],
    // This app must not be framed by third parties (clickjacking).
    'frame-ancestors': ["'self'"],
    // `blob:` is required by FilePreviewDialog: receipts are downloaded with
    // the auth token and rendered from an object URL. `data:` covers inlined
    // assets (e.g. SVG favicons).
    'img-src': ["'self'", 'data:', 'blob:'],
    // No <object>/<embed> is used in the app; mirrors frame-src so a browser
    // that renders the PDF preview through a plugin keeps working.
    'object-src': ["'self'", 'blob:'],
    // Vite emits the SPA bundle as a same-origin external module ('self'),
    // while index.html carries an inline theme script that runs before first
    // paint — that inline script requires `'unsafe-inline'`.
    'script-src': ["'self'", "'unsafe-inline'"],
    // Inline event-handler attributes (onclick=...) stay forbidden.
    'script-src-attr': ["'none'"],
    // Tailwind's stylesheet is same-origin; React and UI libraries use inline
    // style attributes, which requires `'unsafe-inline'`.
    'style-src': ["'self'", "'unsafe-inline'"],
    // Every API call is relative (`/api/...`), i.e. same origin.
    'connect-src': ["'self'"],
    // FilePreviewDialog renders PDF previews in an <iframe> fed by a blob: URL.
    'frame-src': ["'self'", 'blob:'],
  },
};

/** Absolute path to the built SPA, resolved from the validated env config. */
const webDistDir = path.resolve(env.WEB_DIST_DIR);

/**
 * The SPA is served only when a build is actually present. In local
 * development (`npm run dev`) and in the test suites there is no web build, so
 * static serving is skipped entirely and the server behaves exactly as before.
 */
const indexHtmlPath = path.join(webDistDir, 'index.html');
const hasWebBuild = fs.existsSync(indexHtmlPath);

/** True for `/api` and `/api/...`, false for lookalikes such as `/apifoo`. */
function isApiPath(requestPath: string): boolean {
  return requestPath === '/api' || requestPath.startsWith('/api/');
}

export function createApp() {
  const app = express();

  // Security headers, including the SPA-aware CSP above.
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy }));

  // Restricted CORS (comma-separated allow-list).
  const origins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin: origins.length ? origins : true,
      credentials: true,
    }),
  );

  // Body parsing with a sane limit (file uploads use multipart instead).
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV });
  });

  app.use('/api', apiRouter);

  // Built SPA served from the same origin. Registered AFTER /api so the API
  // always takes precedence; skipped when there is no build to serve.
  if (hasWebBuild) {
    app.use(
      express.static(webDistDir, {
        index: false,
        setHeaders(res, filePath) {
          const rel = path.relative(webDistDir, filePath).split(path.sep).join('/');
          if (rel.startsWith('assets/')) {
            // Vite fingerprints asset filenames, safe to cache forever.
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (rel === 'index.html') {
            // The HTML entry point must never be cached so deploys take effect.
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );

    // SPA fallback for react-router deep links (e.g. /pagos/12). Only non-API
    // GET/HEAD requests reach here; unknown /api/* paths deliberately fall
    // through to `notFoundHandler` so API 404s stay JSON.
    app.get('*', (req, res, next) => {
      if (isApiPath(req.path)) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtmlPath);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
