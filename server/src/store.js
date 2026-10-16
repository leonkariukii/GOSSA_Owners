import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from 'node:process';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(env.GOSSA_DATA_DIR || path.join(__dirname, '../data'));
const storeFile = path.join(dataDir, 'store.json');
const requestStorage = new AsyncLocalStorage();
const databaseConfigured = Boolean(env.DATABASE_URL);
let pool;
let cachedStore = null;
let databaseInitialized = false;

function emptyStore() {
  return {
    garage: createDefaultGarage(),
    owner: null,
    sessions: [],
    mechanics: [],
    jobs: [],
    jobHistory: [],
    nextJobSequence: {},
  };
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.VERCEL ? 1 : 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    });
  }
  return pool;
}

async function initializeDatabase() {
  if (databaseInitialized) {
    return;
  }

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS gossa_app_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await getPool().query(
    `INSERT INTO gossa_app_state (id, state) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(emptyStore())],
  );
  databaseInitialized = true;
}

function normalizeStore(store) {
  store.garage ??= createDefaultGarage();
  store.owner ??= null;
  store.sessions ??= [];
  store.mechanics ??= [];
  store.jobs ??= [];
  store.jobHistory ??= [];
  store.nextJobSequence ??= {};
  return store;
}

export function createDefaultGarage() {
  const now = new Date().toISOString();
  return {
    id: 'garage_01',
    name: 'Northside Garage',
    time_zone: 'UTC',
    created_at: now,
    updated_at: now,
    version: 1,
  };
}

export function isDatabaseConfigured() {
  return databaseConfigured;
}

export async function ensureStore() {
  if (env.VERCEL && !databaseConfigured) {
    throw new Error('DATABASE_URL must be configured for Vercel deployments.');
  }

  if (databaseConfigured) {
    await initializeDatabase();
    if (!cachedStore) {
      const result = await getPool().query('SELECT state FROM gossa_app_state WHERE id = 1');
      cachedStore = normalizeStore(result.rows[0].state);
    }
    return cachedStore;
  }

  if (cachedStore) {
    return cachedStore;
  }

  await mkdir(dataDir, { recursive: true });

  try {
    const content = await readFile(storeFile, 'utf8');
    if (!content.trim()) {
      cachedStore = emptyStore();
      await writeFile(storeFile, JSON.stringify(cachedStore, null, 2));
      return cachedStore;
    }

    cachedStore = normalizeStore(JSON.parse(content));
    return cachedStore;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    cachedStore = emptyStore();
    await writeFile(storeFile, JSON.stringify(cachedStore, null, 2));
    return cachedStore;
  }
}

export async function beginStoreRequest() {
  if (!databaseConfigured) {
    return {
      store: await ensureStore(),
      run: (callback) => callback(),
      commit: async () => {},
      rollback: async () => {},
    };
  }

  await initializeDatabase();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT state FROM gossa_app_state WHERE id = 1 FOR UPDATE');
    const store = normalizeStore(result.rows[0].state);
    const context = { client, store };
    let released = false;
    const release = (error) => {
      if (!released) {
        released = true;
        client.release(error);
      }
    };
    return {
      store,
      run: (callback) => requestStorage.run(context, callback),
      commit: async () => {
        try {
          await client.query(
            'UPDATE gossa_app_state SET state = $1::jsonb, updated_at = NOW() WHERE id = 1',
            [JSON.stringify(context.store)],
          );
          await client.query('COMMIT');
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            console.error('Failed to roll back application state.', rollbackError);
          }
          release(error);
          throw error;
        }
        release();
      },
      rollback: async () => {
        try {
          await client.query('ROLLBACK');
        } finally {
          release();
        }
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    throw error;
  }
}

export async function saveStore(store) {
  const activeStore = store ?? requestStorage.getStore()?.store ?? cachedStore;
  if (!activeStore) {
    return;
  }

  cachedStore = activeStore;
  const requestContext = requestStorage.getStore();
  if (requestContext) {
    requestContext.store = activeStore;
    return;
  }

  if (databaseConfigured) {
    await initializeDatabase();
    await getPool().query(
      `INSERT INTO gossa_app_state (id, state) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [JSON.stringify(activeStore)],
    );
    return;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(storeFile, JSON.stringify(activeStore, null, 2));
}
