import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { resetPublicDemoData } from './demo.js';

let pool;
try {
  const config = loadConfig();
  if (!config.PUBLIC_DEMO_MODE) {
    throw new Error('Refusing to reset data unless PUBLIC_DEMO_MODE=true.');
  }

  pool = createPool(config);
  await resetPublicDemoData(pool);
  console.log('Public demo data reset to the sample dataset.');
} catch (error) {
  console.error(`Public demo reset failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
