import { buildAssignments } from './sql.js';

const GARAGE_COLUMNS = 'id, name, time_zone, created_at, updated_at, version';

export async function findGarage(db, garageId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${GARAGE_COLUMNS} FROM garages WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [garageId],
  );
  return rows[0] ?? null;
}

export async function updateGarageFields(db, garageId, fields) {
  const { sql, values } = buildAssignments(fields, 2);
  const { rows } = await db.query(
    `UPDATE garages SET ${sql}, version = version + 1, updated_at = now()
     WHERE id = $1 RETURNING ${GARAGE_COLUMNS}`,
    [garageId, ...values],
  );
  return rows[0];
}

export async function timeZoneExists(db, name) {
  const { rowCount } = await db.query('SELECT 1 FROM pg_timezone_names WHERE name = $1 LIMIT 1', [name]);
  return rowCount > 0;
}

/** Current calendar year in the garage's time zone (used for job numbers). */
export async function currentYearIn(db, timeZone) {
  const { rows } = await db.query('SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE $1::text))::int AS year', [timeZone]);
  return rows[0].year;
}
