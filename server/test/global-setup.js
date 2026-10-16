import { runMigrations } from '../src/migrations.js';

/** Apply migrations to the disposable test database once before the suite runs. */
export async function setup() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Point it at a dedicated, disposable PostgreSQL database ' +
        '(its name must contain "test"), for example postgres://postgres:postgres@localhost:5432/gossa_test.',
    );
  }
  await runMigrations({ databaseUrl, direction: 'up' });
}
