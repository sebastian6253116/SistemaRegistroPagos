import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { startBcvJob, stopBcvJob } from './jobs/bcv-rate.job';

async function bootstrap() {
  const app = createApp();

  // Fail fast if the database is unreachable.
  await prisma.$connect();

  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Informational BCV rate poller; runs after DB + listen are ready.
  startBcvJob();

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received, shutting down...`);
    stopBcvJob();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start API:', err);
  process.exit(1);
});
