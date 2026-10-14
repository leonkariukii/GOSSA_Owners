const IDLE_INTERVAL = "interval '8 hours'";
const ABSOLUTE_INTERVAL = "interval '7 days'";

export async function insertSession(db, { id, sessionIdHash, ownerUserId, csrfToken }) {
  await db.query(
    `INSERT INTO sessions (id, session_id_hash, owner_user_id, csrf_token, idle_expires_at, absolute_expires_at)
     VALUES ($1, $2, $3, $4, now() + ${IDLE_INTERVAL}, now() + ${ABSOLUTE_INTERVAL})`,
    [id, sessionIdHash, ownerUserId, csrfToken],
  );
}

/** Look up a session that is neither revoked nor expired, with its owner and garage. */
export async function findActiveSession(db, sessionIdHash) {
  const { rows } = await db.query(
    `SELECT s.id AS session_id, s.csrf_token, s.last_activity_at,
            u.id AS user_id, u.name AS user_name, u.email, u.garage_id,
            g.name AS garage_name, g.time_zone, g.version AS garage_version
     FROM sessions s
     JOIN owner_users u ON u.id = s.owner_user_id
     JOIN garages g ON g.id = u.garage_id
     WHERE s.session_id_hash = $1
       AND s.revoked_at IS NULL
       AND s.idle_expires_at > now()
       AND s.absolute_expires_at > now()`,
    [sessionIdHash],
  );
  return rows[0] ?? null;
}

/** Sliding idle expiry that can never extend past the absolute expiry. */
export async function touchSession(db, sessionId) {
  await db.query(
    `UPDATE sessions
     SET last_activity_at = now(),
         idle_expires_at = LEAST(now() + ${IDLE_INTERVAL}, absolute_expires_at)
     WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );
}

export async function revokeSession(db, sessionId) {
  await db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
}

export async function deleteStaleSessions(db) {
  await db.query(
    `DELETE FROM sessions
     WHERE absolute_expires_at < now() - interval '1 day'
        OR revoked_at < now() - interval '1 day'`,
  );
}
