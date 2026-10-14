import { loadConfig } from './config.js';
import { runMigrations } from './migrations.js';

const direction = process.argv[2];
const count = process.argv[3] ? Number(process.argv[3]) : undefined;

if (!['up', 'down'].includes(direction) || (count !== undefined && !Number.isInteger(count))) {
  console.error('Usage: node src/migrate.js <up|down> [count]');
  process.exit(1);
}

try {
  const config = loadConfig();
  const applied = await runMigrations({
    databaseUrl: config.DATABASE_URL,
    direction,
    count,
    log: (message) => console.log(message),
  });
  console.log(`Migration ${direction} complete: ${applied.length} migration(s) ${direction === 'up' ? 'applied' : 'reverted'}.`);
} catch (error) {
  console.error(`Migration ${direction} failed: ${error.message}`);
  process.exit(1);
}
