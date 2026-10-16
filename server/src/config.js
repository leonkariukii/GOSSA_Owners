import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  // Number of reverse-proxy hops to trust for req.ip (0 = none).
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
});

/**
 * Validate environment configuration once, at startup. There are deliberately no
 * development fallbacks for DATABASE_URL: a missing value is a startup error in
 * every environment, and tests only ever use TEST_DATABASE_URL.
 */
export function loadConfig(env = process.env) {
  const source = {};
  for (const key of Object.keys(configSchema.shape)) {
    const value = env[key];
    if (value !== undefined && value !== '') {
      source[key] = value;
    }
  }

  if (source.NODE_ENV === 'test') {
    if (!env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL must point at a dedicated, disposable PostgreSQL database to run tests.');
    }
    source.DATABASE_URL = env.TEST_DATABASE_URL;
  }

  const result = configSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new Error(`Invalid server configuration: ${problems.join('; ')}`);
  }

  const config = result.data;
  return { ...config, LOG_LEVEL: config.LOG_LEVEL ?? (config.NODE_ENV === 'test' ? 'silent' : 'info') };
}
