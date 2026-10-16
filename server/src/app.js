import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { authenticate, requireCsrf } from './http/auth.js';
import { createFailureLimiter } from './http/rate-limit.js';
import { errorHandler, noStore, notFoundHandler, requestContext, securityHeaders } from './http/request.js';
import { createPublicAuthRouter, createSessionRouter } from './routes/auth.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createGarageRouter } from './routes/garage.js';
import { createJobsRouter } from './routes/jobs.js';
import { createMechanicsRouter } from './routes/mechanics.js';

/**
 * Build the Express application. Nothing here listens on a port, so tests can mount
 * it with Supertest. CORS is intentionally not enabled: the app is same-origin
 * (Vite proxy in development, Express serving `dist/` in production).
 */
export function createApp({ config, pool, logger, staticDir = null }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false); // ETags are set explicitly from record versions.
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(requestContext(logger));
  app.use(securityHeaders(config));

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      res.status(503).json({ ok: false });
    }
  });

  const limiter = createFailureLimiter({
    windowMs: config.LOGIN_RATE_LIMIT_WINDOW_MS,
    max: config.LOGIN_RATE_LIMIT_MAX,
  });

  const api = express.Router();
  api.use(noStore);
  api.use(express.json({ limit: '100kb' }));
  api.use(createPublicAuthRouter({ pool, config, limiter }));

  // Everything below requires the owner session; state-changing requests also need CSRF.
  api.use(authenticate({ pool }));
  api.use(requireCsrf);
  api.use(createSessionRouter({ pool, config }));
  api.use(createGarageRouter({ pool }));
  api.use(createDashboardRouter({ pool }));
  api.use(createMechanicsRouter({ pool }));
  api.use(createJobsRouter({ pool }));
  api.use(notFoundHandler);

  app.use('/api/v1', api);
  app.use('/api', notFoundHandler);

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    const csp = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'";
    app.use(
      express.static(staticDir, {
        index: false,
        setHeaders: (res) => res.set('Content-Security-Policy', csp),
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      res.set('Content-Security-Policy', csp);
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
