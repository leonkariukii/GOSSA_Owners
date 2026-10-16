export async function getDashboard(db, garageId, timeZone) {
  const [counts, completedToday, recent] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
         COUNT(*) FILTER (WHERE status = 'waiting')::int AS waiting_count
       FROM jobs WHERE garage_id = $1 AND archived_at IS NULL`,
      [garageId],
    ),
    // "Today" is the garage's local calendar day, converted to UTC bounds in SQL so DST is handled.
    db.query(
      `SELECT COUNT(*)::int AS completed_today_count
       FROM job_history h
       JOIN jobs j ON j.garage_id = h.garage_id AND j.id = h.job_id
       WHERE h.garage_id = $1
         AND h.to_status = 'completed'
         AND j.archived_at IS NULL
         AND h.created_at >= (date_trunc('day', now() AT TIME ZONE $2::text)) AT TIME ZONE $2::text
         AND h.created_at < (date_trunc('day', now() AT TIME ZONE $2::text) + interval '1 day') AT TIME ZONE $2::text`,
      [garageId, timeZone],
    ),
    db.query(
      `SELECT j.id, j.job_number, j.status, j.customer_name, j.vehicle_registration, j.updated_at,
              m.id AS mechanic_id, m.name AS mechanic_name
       FROM jobs j
       LEFT JOIN mechanics m ON m.garage_id = j.garage_id AND m.id = j.assigned_mechanic_id
       WHERE j.garage_id = $1 AND j.archived_at IS NULL
       ORDER BY j.updated_at DESC, j.id DESC
       LIMIT 10`,
      [garageId],
    ),
  ]);

  return {
    open_count: counts.rows[0].open_count,
    in_progress_count: counts.rows[0].in_progress_count,
    waiting_count: counts.rows[0].waiting_count,
    completed_today_count: completedToday.rows[0].completed_today_count,
    recent_jobs: recent.rows.map((row) => ({
      id: row.id,
      job_number: row.job_number,
      status: row.status,
      customer_name: row.customer_name,
      vehicle_registration: row.vehicle_registration,
      assigned_mechanic: row.mechanic_id ? { id: row.mechanic_id, name: row.mechanic_name } : null,
      updated_at: row.updated_at,
    })),
  };
}
