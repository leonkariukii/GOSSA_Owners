import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createLogger } from './logger.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const logger = createLogger({ level: config.LOG_LEVEL });
const pool = createPool(config, logger);

try {
  await pool.query('SELECT 1');
} catch (error) {
  logger.error('Cannot connect to PostgreSQL. Check DATABASE_URL and run migrations.', { error: error.message });
  process.exit(1);
}

// In production Express serves the built frontend (repository-root dist/) from the same origin.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const staticDir = config.NODE_ENV === 'production' && fs.existsSync(distDir) ? distDir : null;

const app = createApp({ config, pool, logger, staticDir });
const server = app.listen(config.PORT, () => {
  logger.info('GOSSA server listening', { port: config.PORT, env: config.NODE_ENV, serves_frontend: Boolean(staticDir) });
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 65_000;

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('Shutting down', { signal });
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
