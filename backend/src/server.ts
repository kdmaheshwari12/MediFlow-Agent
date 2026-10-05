import dotenv from 'dotenv';
dotenv.config();

import { buildApp } from './app';
import { initBoss } from './lib/boss';
import { startWorkers } from './jobs/worker';

process.on('unhandledRejection', (reason: any) => {
  console.error('Unhandled Promise Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err: any) => {
  console.error('Uncaught Exception:', err?.message || err);
});

async function start() {
  await initBoss();
  await startWorkers();
  
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '4000', 10);

  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server running at http://127.0.0.1:${port}`);
  } catch (err: any) {
    app.log.error(`Failed to start server: ${err?.message || err}`);
    process.exit(1);
  }
}

start();
