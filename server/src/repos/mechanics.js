import crypto from 'node:crypto';
import { buildAssignments, escapeLike, offsetFor, orderBy } from './sql.js';

export const MECHANIC_COLUMNS =
  'id, garage_id, name, phone, skills, duty_status, created_at, updated_at, version, archived_at';

const SORT_EXPRESSIONS = {
  name: ['lower(name)'],
  created_at: ['created_at'],
  updated_at: ['updated_at'],
};

export async function listMechanics(db, garageId, query) {
  const params = [garageId];
  const where = ['garage_id = $1'];
  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (!query.includeArchived) {
    where.push('archived_at IS NULL');
  }
  if (query.dutyStatus) {
    where.push(`duty_status = ${bind(query.dutyStatus)}`);
  }
  if (query.q) {
    const like = bind(`%${escapeLike(query.q)}%`);
    where.push(`(name ILIKE ${like} OR phone ILIKE ${like})`);
  }

  const whereSql = where.join(' AND ');
  const { rows: counts } = await db.query(`SELECT COUNT(*)::int AS total FROM mechanics WHERE ${whereSql}`, params);
  const limit = bind(query.pageSize);
  const offset = bind(offsetFor(query.page, query.pageSize));
  const { rows } = await db.query(
    `SELECT ${MECHANIC_COLUMNS} FROM mechanics WHERE ${whereSql}
     ORDER BY ${orderBy(SORT_EXPRESSIONS[query.sortBy], query.order)}
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return { rows, total: counts[0].total };
}

export async function findMechanic(db, garageId, id, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${MECHANIC_COLUMNS} FROM mechanics WHERE garage_id = $1 AND id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [garageId, id],
  );
  return rows[0] ?? null;
}

/** Lock mechanics in id order (consistent lock ordering) and return them keyed by id. */
export async function lockMechanics(db, garageId, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }
  const { rows } = await db.query(
    `SELECT ${MECHANIC_COLUMNS} FROM mechanics
     WHERE garage_id = $1 AND id = ANY($2::text[])
     ORDER BY id FOR UPDATE`,
    [garageId, unique],
  );
  return new Map(rows.map((row) => [row.id, row]));
}

export async function insertMechanic(db, garageId, { name, phone, skills }) {
  const { rows } = await db.query(
    `INSERT INTO mechanics (id, garage_id, name, phone, skills)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${MECHANIC_COLUMNS}`,
    [`mech_${crypto.randomUUID()}`, garageId, name, phone ?? null, skills ?? null],
  );
  return rows[0];
}

export async function updateMechanicFields(db, garageId, id, fields) {
  const { sql, values } = buildAssignments(fields, 3);
  const { rows } = await db.query(
    `UPDATE mechanics SET ${sql}, version = version + 1, updated_at = now()
     WHERE garage_id = $1 AND id = $2 RETURNING ${MECHANIC_COLUMNS}`,
    [garageId, id, ...values],
  );
  return rows[0];
}

export async function setDutyStatus(db, garageId, id, dutyStatus) {
  const { rows } = await db.query(
    `UPDATE mechanics SET duty_status = $3, version = version + 1, updated_at = now()
     WHERE garage_id = $1 AND id = $2 RETURNING ${MECHANIC_COLUMNS}`,
    [garageId, id, dutyStatus],
  );
  return rows[0];
}

export async function archiveMechanic(db, garageId, id) {
  const { rows } = await db.query(
    `UPDATE mechanics SET archived_at = now(), version = version + 1, updated_at = now()
     WHERE garage_id = $1 AND id = $2 RETURNING ${MECHANIC_COLUMNS}`,
    [garageId, id],
  );
  return rows[0];
}

export async function hasInProgressJob(db, garageId, mechanicId) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM jobs
     WHERE garage_id = $1 AND assigned_mechanic_id = $2 AND status = 'in_progress' AND archived_at IS NULL
     LIMIT 1`,
    [garageId, mechanicId],
  );
  return rowCount > 0;
}

export async function hasNonterminalJobs(db, garageId, mechanicId) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM jobs
     WHERE garage_id = $1 AND assigned_mechanic_id = $2
       AND status IN ('open', 'in_progress', 'waiting') AND archived_at IS NULL
     LIMIT 1`,
    [garageId, mechanicId],
  );
  return rowCount > 0;
}
