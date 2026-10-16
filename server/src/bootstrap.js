import crypto from 'node:crypto';
import argon2 from 'argon2';
import { withTransaction } from './db.js';
import { timeZoneExists } from './repos/garages.js';

export class BootstrapError extends Error {}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(input) {
  const garageName = String(input.garageName ?? '').trim();
  const timeZone = String(input.timeZone ?? '').trim();
  const ownerName = String(input.ownerName ?? '').trim();
  const email = String(input.ownerEmail ?? '').trim().toLowerCase();
  const password = typeof input.ownerPassword === 'string' ? input.ownerPassword : '';

  if (garageName.length < 1 || garageName.length > 120) {
    throw new BootstrapError('Garage name must be 1-120 characters.');
  }
  if (timeZone.length < 1 || timeZone.length > 64) {
    throw new BootstrapError('Garage time zone must be a valid IANA name of at most 64 characters.');
  }
  if (ownerName.length < 1 || ownerName.length > 120) {
    throw new BootstrapError('Owner name must be 1-120 characters.');
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new BootstrapError('Owner email must be a valid email address of at most 254 characters.');
  }
  // Passwords are never trimmed or truncated.
  if (password.length < 12 || password.length > 128) {
    throw new BootstrapError('Owner password must be 12-128 characters.');
  }

  return { garageName, timeZone, ownerName, email, password };
}

/**
 * Create the initial garage and owner. Idempotent: if an owner already exists
 * nothing is changed or overwritten. The password is hashed with Argon2id and is
 * never returned or logged.
 */
export async function bootstrapOwner(pool, input) {
  const existing = await pool.query('SELECT 1 FROM owner_users LIMIT 1');
  if (existing.rowCount > 0) {
    return { created: false };
  }

  const values = validate(input);
  const passwordHash = await argon2.hash(values.password, { type: argon2.argon2id });

  return withTransaction(pool, async (db) => {
    // Serialise concurrent bootstraps; re-check once the lock is held.
    await db.query('SELECT pg_advisory_xact_lock(727001)');
    const recheck = await db.query('SELECT 1 FROM owner_users LIMIT 1');
    if (recheck.rowCount > 0) {
      return { created: false };
    }
    if (!(await timeZoneExists(db, values.timeZone))) {
      throw new BootstrapError('Garage time zone must be a valid IANA time zone name.');
    }

    const garageId = `garage_${crypto.randomUUID()}`;
    await db.query('INSERT INTO garages (id, name, time_zone) VALUES ($1, $2, $3)', [
      garageId,
      values.garageName,
      values.timeZone,
    ]);
    await db.query(
      'INSERT INTO owner_users (id, garage_id, name, email, password_hash) VALUES ($1, $2, $3, $4, $5)',
      [`user_${crypto.randomUUID()}`, garageId, values.ownerName, values.email, passwordHash],
    );

    return { created: true, garageName: values.garageName, ownerEmail: values.email };
  });
}
