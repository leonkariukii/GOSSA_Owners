import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

/** Apply (up) or revert (down) versioned SQL migrations with node-pg-migrate. */
export async function runMigrations({ databaseUrl, direction = 'up', count, log = () => {} }) {
  return runner({
    databaseUrl,
    dir: migrationsDir,
    direction,
    migrationsTable: 'pgmigrations',
    count: count ?? (direction === 'up' ? Infinity : 1),
    singleTransaction: true,
    log,
  });
}
