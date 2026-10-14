import crypto from 'node:crypto';
import argon2 from 'argon2';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { normalizeRegistration } from '../src/domain/registration.js';
import { createLogger } from '../src/logger.js';

export const OWNER_PASSWORD = 'correct horse battery staple';

export function createTestContext(overrides = {}) {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', ...overrides });
  const logger = createLogger({ level: 'silent' });
  const pool = createPool(config, logger);
  const app = createApp({ config, pool, logger });
  return { config, pool, app, logger };
}

/** Empty every table. Refuses to run unless the database name looks disposable. */
export async function resetDatabase(pool) {
  const { rows } = await pool.query('SELECT current_database() AS name');
  if (!/test/i.test(rows[0].name)) {
    throw new Error(`Refusing to truncate database "${rows[0].name}": its name must contain "test".`);
  }
  await pool.query(
    'TRUNCATE job_history, job_number_counters, jobs, mechanics, sessions, owner_users, garages RESTART IDENTITY CASCADE',
  );
}

let cachedHash;
async function ownerPasswordHash() {
  cachedHash ??= await argon2.hash(OWNER_PASSWORD, { type: argon2.argon2id });
  return cachedHash;
}

/** Insert a garage and its owner directly in the database (also used for a second tenant). */
export async function seedGarage(pool, { name = 'Northside Garage', timeZone = 'UTC', email = 'owner@example.com', ownerName = 'Owner User' } = {}) {
  const garageId = `garage_${crypto.randomUUID()}`;
  const userId = `user_${crypto.randomUUID()}`;
  await pool.query('INSERT INTO garages (id, name, time_zone) VALUES ($1, $2, $3)', [garageId, name, timeZone]);
  await pool.query(
    'INSERT INTO owner_users (id, garage_id, name, email, password_hash) VALUES ($1, $2, $3, $4, $5)',
    [userId, garageId, ownerName, email, await ownerPasswordHash()],
  );
  return { garageId, userId, email };
}

let counter = 0;

export async function seedMechanic(pool, garageId, { name, dutyStatus = 'available', archived = false } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO mechanics (id, garage_id, name, duty_status, archived_at)
     VALUES ($1, $2, $3, $4, ${archived ? 'now()' : 'NULL'}) RETURNING *`,
    [`mech_${crypto.randomUUID()}`, garageId, name ?? `Seeded Mechanic ${++counter}`, dutyStatus],
  );
  return rows[0];
}

export async function seedJob(pool, garageId, userId, { status = 'open', mechanicId = null, registration, jobNumber, customerName = 'Seeded Customer' } = {}) {
  counter += 1;
  const reg = registration ?? `SEED ${counter}X`;
  const { rows } = await pool.query(
    `INSERT INTO jobs (id, garage_id, job_number, status, customer_name, vehicle_registration,
       normalized_vehicle_registration, work_requested, assigned_mechanic_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Seeded work', $8, $9) RETURNING *`,
    [
      `job_${crypto.randomUUID()}`,
      garageId,
      jobNumber ?? `JC-2026-${String(counter).padStart(3, '0')}`,
      status,
      customerName,
      reg,
      normalizeRegistration(reg),
      mechanicId,
      userId,
    ],
  );
  return rows[0];
}

/** Sign in and return a client that sends the session cookie, CSRF token and If-Match for you. */
export async function login(app, email = 'owner@example.com', password = OWNER_PASSWORD) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  const csrf = response.body.data.csrf_token;

  const withHeaders = (req, version) => {
    req.set('X-CSRF-Token', csrf);
    if (version !== undefined) {
      req.set('If-Match', `"v${version}"`);
    }
    return req;
  };

  return {
    agent,
    csrf,
    get: (path) => agent.get(`/api/v1${path}`),
    post: (path, body, version) => withHeaders(agent.post(`/api/v1${path}`), version).send(body),
    patch: (path, body, version) => withHeaders(agent.patch(`/api/v1${path}`), version).send(body),
  };
}

export async function createMechanicViaApi(client, overrides = {}) {
  const response = await client.post('/mechanics', { name: `Mechanic ${++counter}`, ...overrides }).expect(201);
  return response.body.data;
}

export async function createJobViaApi(client, overrides = {}) {
  const response = await client
    .post('/jobs', {
      customer_name: 'Sam Example',
      vehicle_registration: `KDA ${100 + ++counter}A`,
      work_requested: 'Inspect front brakes',
      ...overrides,
    })
    .expect(201);
  return response.body.data;
}

export function expectError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.body.error).toMatchObject({ code, status });
  expect(response.body.error.request_id).toMatch(/^req_/);
  expect(typeof response.body.error.timestamp).toBe('string');
  expect(response.body.error.message).toBeTruthy();
}
