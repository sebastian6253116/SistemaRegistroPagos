import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import apiRouter from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  // Security headers.
  app.disable('x-powered-by');
  app.use(helmet());

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
