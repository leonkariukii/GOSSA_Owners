import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import { BootstrapError, bootstrapOwner } from './bootstrap.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

function fromEnv(name) {
  const value = process.env[name];
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

async function ask(label, fallback) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

/** Read a secret from the terminal without echoing it. */
async function askSecret(label) {
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!output.muted) {
        process.stdout.write(chunk, encoding);
      }
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  try {
    process.stdout.write(`${label}: `);
    output.muted = true;
    return await rl.question('');
  } finally {
    output.muted = false;
    rl.close();
    process.stdout.write('\n');
  }
}

async function collect() {
  const values = {
    garageName: fromEnv('GOSSA_GARAGE_NAME'),
    timeZone: fromEnv('GOSSA_GARAGE_TIMEZONE'),
    ownerName: fromEnv('GOSSA_OWNER_NAME'),
    ownerEmail: fromEnv('GOSSA_OWNER_EMAIL'),
    ownerPassword: process.env.GOSSA_OWNER_PASSWORD || undefined,
  };

  if (!interactive) {
    const missing = [
      ['GOSSA_GARAGE_NAME', values.garageName],
      ['GOSSA_GARAGE_TIMEZONE', values.timeZone],
      ['GOSSA_OWNER_NAME', values.ownerName],
      ['GOSSA_OWNER_EMAIL', values.ownerEmail],
      ['GOSSA_OWNER_PASSWORD', values.ownerPassword],
    ].filter(([, value]) => value === undefined);
    if (missing.length > 0) {
      throw new BootstrapError(
        `Not running in a terminal; set ${missing.map(([name]) => name).join(', ')} in the process environment.`,
      );
    }
    return values;
  }

  values.garageName ??= await ask('Garage name', 'Northside Garage');
  values.timeZone ??= await ask('Garage time zone (IANA)', 'UTC');
  values.ownerName ??= await ask('Owner name');
  values.ownerEmail ??= await ask('Owner email');
  if (values.ownerPassword === undefined) {
    const first = await askSecret('Owner password (12-128 characters)');
    const second = await askSecret('Confirm owner password');
    if (first !== second) {
      throw new BootstrapError('Passwords do not match.');
    }
    values.ownerPassword = first;
  }
  return values;
}

let pool;
try {
  const config = loadConfig();
  pool = createPool(config);

  // If an owner already exists this is a no-op, so deployments can run it on every start.
  const existing = await pool.query('SELECT 1 FROM owner_users LIMIT 1');
  if (existing.rowCount > 0) {
    console.log('Owner already exists; bootstrap skipped.');
  } else {
    const result = await bootstrapOwner(pool, await collect());
    console.log(
      result.created
        ? `Bootstrap complete. Garage "${result.garageName}" and owner "${result.ownerEmail}" are ready.`
        : 'Owner already exists; bootstrap skipped.',
    );
  }
} catch (error) {
  console.error(error instanceof BootstrapError ? error.message : `Bootstrap failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
