export async function findOwnerByEmail(db, email) {
  const { rows } = await db.query(
    `SELECT u.id, u.garage_id, u.name, u.email, u.password_hash,
            g.name AS garage_name, g.time_zone
     FROM owner_users u
     JOIN garages g ON g.id = u.garage_id
     WHERE u.email = $1`,
    [email],
  );
  return rows[0] ?? null;
}
