import crypto from 'node:crypto';
import argon2 from 'argon2';
import { withTransaction } from './db.js';

const DEMO_DATABASE_NAME = 'gossa_demo';

export async function assertPublicDemoDatabase(pool) {
  const { rows } = await pool.query('SELECT current_database() AS name');
  if (rows[0]?.name !== DEMO_DATABASE_NAME) {
    throw new Error(`Refusing public demo access to database "${rows[0]?.name ?? 'unknown'}"; expected "${DEMO_DATABASE_NAME}".`);
  }
}

export async function resetPublicDemoData(pool) {
  await assertPublicDemoDatabase(pool);

  const passwordHash = await argon2.hash(crypto.randomBytes(32).toString('base64url'), {
    type: argon2.argon2id,
  });

  await withTransaction(pool, async (db) => {
    await db.query(
      'TRUNCATE job_history, job_number_counters, jobs, mechanics, sessions, owner_users, garages RESTART IDENTITY CASCADE',
    );
    await db.query(
      `INSERT INTO garages (id, name, time_zone)
       VALUES ('demo_garage', 'GOSSA Demo Garage', 'UTC')`,
    );
    await db.query(
      `INSERT INTO owner_users (id, garage_id, name, email, password_hash)
       VALUES ('demo_owner', 'demo_garage', 'Demo User', 'demo-owner@example.invalid', $1)`,
      [passwordHash],
    );
    await db.query(
      `INSERT INTO mechanics (id, garage_id, name, skills, duty_status)
       VALUES
         ('demo_mechanic_1', 'demo_garage', 'Alex Morgan', 'Brakes and diagnostics', 'busy'),
         ('demo_mechanic_2', 'demo_garage', 'Jamie Lee', 'Electrical systems', 'available')`,
    );
    await db.query(
      `INSERT INTO jobs (
         id, garage_id, job_number, status, customer_name, vehicle_registration,
         normalized_vehicle_registration, vehicle_make, vehicle_model, vehicle_year,
         work_requested, assigned_mechanic_id, created_by_user_id
       )
       VALUES
         ('demo_job_1', 'demo_garage', 'JC-' || EXTRACT(YEAR FROM now())::int || '-001',
          'in_progress', 'Taylor Sample', 'DEMO-001', 'DEMO001', 'Toyota', 'Corolla', 2019,
          'Inspect the front brakes', 'demo_mechanic_1', 'demo_owner'),
         ('demo_job_2', 'demo_garage', 'JC-' || EXTRACT(YEAR FROM now())::int || '-002',
          'open', 'Jordan Example', 'DEMO-002', 'DEMO002', 'Honda', 'Civic', 2021,
          'Investigate an intermittent starting issue', NULL, 'demo_owner')`,
    );
  });
}
