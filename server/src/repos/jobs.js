import crypto from 'node:crypto';
import { normalizeRegistration } from '../domain/registration.js';
import { buildAssignments, escapeLike, offsetFor, orderBy } from './sql.js';

export const JOB_COLUMNS = `id, garage_id, job_number, status, customer_name, customer_phone,
  vehicle_registration, vehicle_make, vehicle_model, vehicle_year, odometer_km,
  work_requested, diagnosis, work_performed, internal_notes, assigned_mechanic_id,
  created_by_user_id, created_at, updated_at, version, archived_at`;

const SORT_EXPRESSIONS = {
  // Sort by year then numeric sequence so JC-2026-1000 sorts after JC-2026-999.
  job_number: ["split_part(job_number, '-', 2)::int", "split_part(job_number, '-', 3)::int"],
  status: ['status'],
  created_at: ['created_at'],
  updated_at: ['updated_at'],
};

export async function listJobs(db, garageId, timeZone, query) {
  const params = [garageId];
  const where = ['garage_id = $1'];
  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  let timeZoneParam;
  const tz = () => (timeZoneParam ??= bind(timeZone));

  if (!query.includeArchived) {
    where.push('archived_at IS NULL');
  }
  if (query.status) {
    where.push(`status = ${bind(query.status)}`);
  }
  if (query.mechanicId) {
    where.push(`assigned_mechanic_id = ${bind(query.mechanicId)}`);
  }
  if (query.q) {
    const like = bind(`%${escapeLike(query.q)}%`);
    const parts = [`job_number ILIKE ${like}`, `customer_name ILIKE ${like}`];
    const normalized = normalizeRegistration(query.q);
    if (normalized) {
      parts.push(`normalized_vehicle_registration LIKE ${bind(`%${escapeLike(normalized)}%`)}`);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  if (query.createdFrom) {
    where.push(`created_at >= ((${bind(query.createdFrom)}::date)::timestamp AT TIME ZONE ${tz()}::text)`);
  }
  if (query.createdTo) {
    where.push(`created_at < (((${bind(query.createdTo)}::date + 1))::timestamp AT TIME ZONE ${tz()}::text)`);
  }

  const whereSql = where.join(' AND ');
  const { rows: counts } = await db.query(`SELECT COUNT(*)::int AS total FROM jobs WHERE ${whereSql}`, params);
  const limit = bind(query.pageSize);
  const offset = bind(offsetFor(query.page, query.pageSize));
  const { rows } = await db.query(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE ${whereSql}
     ORDER BY ${orderBy(SORT_EXPRESSIONS[query.sortBy], query.order)}
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return { rows, total: counts[0].total };
}

export async function findJob(db, garageId, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE garage_id = $1 AND id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [garageId, id],
  );
  return rows[0] ?? null;
}

/** Allocate the next per-garage, per-year sequence number inside the caller's transaction. */
export async function nextJobSequence(db, garageId, year) {
  const { rows } = await db.query(
    `INSERT INTO job_number_counters (garage_id, year, last_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (garage_id, year)
     DO UPDATE SET last_value = job_number_counters.last_value + 1
     RETURNING last_value`,
    [garageId, year],
  );
  return rows[0].last_value;
}

export async function insertJob(db, { garageId, userId, jobNumber, input }) {
  const { rows } = await db.query(
    `INSERT INTO jobs (
       id, garage_id, job_number, status, customer_name, customer_phone,
       vehicle_registration, normalized_vehicle_registration, vehicle_make, vehicle_model,
       vehicle_year, odometer_km, work_requested, internal_notes, created_by_user_id
     ) VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING ${JOB_COLUMNS}`,
    [
      `job_${crypto.randomUUID()}`,
      garageId,
      jobNumber,
      input.customer_name,
      input.customer_phone ?? null,
      input.vehicle_registration,
      normalizeRegistration(input.vehicle_registration),
      input.vehicle_make ?? null,
      input.vehicle_model ?? null,
      input.vehicle_year ?? null,
      input.odometer_km ?? null,
      input.work_requested,
      input.internal_notes ?? null,
      userId,
    ],
  );
  return rows[0];
}

export async function updateJobFields(db, garageId, id, fields) {
  const { sql, values } = buildAssignments(fields, 3);
  const { rows } = await db.query(
    `UPDATE jobs SET ${sql}, version = version + 1, updated_at = now()
     WHERE garage_id = $1 AND id = $2 RETURNING ${JOB_COLUMNS}`,
    [garageId, id, ...values],
  );
  return rows[0];
}

export async function setJobAssignment(db, garageId, id, mechanicId) {
  const { rows } = await db.query(
    `UPDATE jobs SET assigned_mechanic_id = $3, version = version + 1, updated_at = now()
     WHERE garage_id = $1 AND id = $2 RETURNING ${JOB_COLUMNS}`,
    [garageId, id, mechanicId],
  );
  return rows[0];
}

export async function setJobStatus(db, garageId, id, status) {
  const { rows } = await db.query(
    `UPDATE jobs SET status = $3, version = version + 1, updated_at = now()
     WHERE garage_id = $1 AND id = $2 RETURNING ${JOB_COLUMNS}`,
    [garageId, id, status],
  );
  return rows[0];
}

export async function archiveJob(db, garageId, id) {
  const { rows } = await db.query(
    `UPDATE jobs SET archived_at = now(), version = version + 1, updated_at = now()
     WHERE garage_id = $1 AND id = $2 RETURNING ${JOB_COLUMNS}`,
    [garageId, id],
  );
  return rows[0];
}

export async function insertHistory(db, { garageId, jobId, actorUserId, fromStatus, toStatus, note }) {
  await db.query(
    `INSERT INTO job_history (id, garage_id, job_id, actor_user_id, from_status, to_status, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [`hist_${crypto.randomUUID()}`, garageId, jobId, actorUserId, fromStatus, toStatus, note ?? null],
  );
}

export async function listHistory(db, garageId, jobId, { page, pageSize }) {
  const { rows: counts } = await db.query(
    'SELECT COUNT(*)::int AS total FROM job_history WHERE garage_id = $1 AND job_id = $2',
    [garageId, jobId],
  );
  const { rows } = await db.query(
    `SELECT id, job_id, actor_user_id, from_status, to_status, note, created_at
     FROM job_history WHERE garage_id = $1 AND job_id = $2
     ORDER BY created_at DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [garageId, jobId, pageSize, offsetFor(page, pageSize)],
  );
  return { rows, total: counts[0].total };
}
