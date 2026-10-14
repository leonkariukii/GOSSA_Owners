import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  OWNER_PASSWORD,
  createTestContext,
  expectError,
  login,
  resetDatabase,
  seedGarage,
} from './helpers.js';

const ctx = createTestContext();
let seed;

beforeEach(async () => {
  await resetDatabase(ctx.pool);
  seed = await seedGarage(ctx.pool);
});

afterAll(() => ctx.pool.end());

describe('owner sign-in', () => {
  it('logs in, sets a hardened session cookie and returns the session payload', async () => {
    const response = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: seed.email, password: OWNER_PASSWORD })
      .expect(200);

    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toMatch(/^session_id=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);

    expect(response.body.data).toMatchObject({
      user: { email: seed.email, name: 'Owner User', role: 'owner' },
      garage: { name: 'Northside Garage', time_zone: 'UTC' },
    });
    expect(response.body.data.csrf_token).toHaveLength(43);
    expect(JSON.stringify(response.body)).not.toMatch(/password/i);
  });

  it('accepts the email in any letter case', async () => {
    await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: '  OWNER@Example.com ', password: OWNER_PASSWORD })
      .expect(200);
  });

  it('stores only a hash of the session id and issues a new session each time', async () => {
    const first = await request(ctx.app).post('/api/v1/auth/login').send({ email: seed.email, password: OWNER_PASSWORD });
    const second = await request(ctx.app).post('/api/v1/auth/login').send({ email: seed.email, password: OWNER_PASSWORD });

    const rawToken = first.headers['set-cookie'][0].split(';')[0].split('=')[1];
    expect(rawToken).not.toBe(second.headers['set-cookie'][0].split(';')[0].split('=')[1]);
    expect(first.body.data.csrf_token).not.toBe(second.body.data.csrf_token);

    const { rows } = await ctx.pool.query('SELECT session_id_hash, csrf_token FROM sessions');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.session_id_hash)).not.toContain(rawToken);
    expect(rows.map((row) => row.csrf_token)).toContain(first.body.data.csrf_token);
  });

  it('gives the same generic failure for a wrong password and an unknown account', async () => {
    const wrongPassword = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: seed.email, password: 'definitely not the password' });
    const unknownAccount = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: OWNER_PASSWORD });
    const malformed = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'nope', password: 'short' });

    for (const response of [wrongPassword, unknownAccount, malformed]) {
      expectError(response, 401, 'UNAUTHENTICATED');
      expect(response.body.error.message).toBe('Invalid email or password.');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('rate limits repeated failed sign-ins', async () => {
    const limited = createTestContext({ LOGIN_RATE_LIMIT_MAX: '3' });
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await request(limited.app)
          .post('/api/v1/auth/login')
          .send({ email: seed.email, password: 'wrong password here' })
          .expect(401);
      }
      const blocked = await request(limited.app)
        .post('/api/v1/auth/login')
        .send({ email: seed.email, password: OWNER_PASSWORD });
      expectError(blocked, 429, 'RATE_LIMITED');
    } finally {
      await limited.pool.end();
    }
  });
});

describe('session lifecycle', () => {
  it('rejects unauthenticated requests to every application route', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/auth/me'],
      ['get', '/api/v1/garage'],
      ['get', '/api/v1/dashboard'],
      ['get', '/api/v1/mechanics'],
      ['get', '/api/v1/jobs'],
      ['post', '/api/v1/jobs'],
      ['post', '/api/v1/auth/logout'],
    ]) {
      expectError(await request(ctx.app)[method](path), 401, 'UNAUTHENTICATED');
    }
  });

  it('returns the current session and CSRF token from /auth/me', async () => {
    const owner = await login(ctx.app);
    const me = await owner.get('/auth/me').expect(200);
    expect(me.body.data.csrf_token).toBe(owner.csrf);
    expect(me.body.data.user.email).toBe(seed.email);
  });

  it('requires the CSRF token for state-changing requests, before touching any resource', async () => {
    const owner = await login(ctx.app);

    const missing = await owner.agent.post('/api/v1/mechanics').send({ name: 'No Token' });
    expectError(missing, 403, 'CSRF_FAILED');

    const wrong = await owner.agent.post('/api/v1/mechanics').set('X-CSRF-Token', 'x'.repeat(43)).send({ name: 'Bad Token' });
    expectError(wrong, 403, 'CSRF_FAILED');

    // The CSRF check precedes lookups, so a real and a made-up id look identical.
    const unknown = await owner.agent.post('/api/v1/jobs/does-not-exist/archive').set('If-Match', '"v1"');
    expectError(unknown, 403, 'CSRF_FAILED');
  });

  it('logs out by revoking the session and clearing the cookie', async () => {
    const owner = await login(ctx.app);

    expectError(await owner.agent.post('/api/v1/auth/logout'), 403, 'CSRF_FAILED');

    const response = await owner.post('/auth/logout').expect(204);
    expect(response.headers['set-cookie'][0]).toMatch(/session_id=;/);

    expectError(await owner.get('/auth/me'), 401, 'UNAUTHENTICATED');
    const { rows } = await ctx.pool.query('SELECT revoked_at FROM sessions');
    expect(rows[0].revoked_at).not.toBeNull();
  });

  it('rejects sessions past their idle or absolute expiry', async () => {
    const idle = await login(ctx.app);
    await ctx.pool.query("UPDATE sessions SET idle_expires_at = now() - interval '1 minute'");
    expectError(await idle.get('/auth/me'), 401, 'UNAUTHENTICATED');

    const absolute = await login(ctx.app);
    await ctx.pool.query("UPDATE sessions SET absolute_expires_at = now() - interval '1 minute' WHERE revoked_at IS NULL");
    expectError(await absolute.get('/auth/me'), 401, 'UNAUTHENTICATED');
  });

  it('slides the idle expiry forward but never beyond the absolute expiry', async () => {
    const owner = await login(ctx.app);
    await ctx.pool.query(
      `UPDATE sessions SET last_activity_at = now() - interval '5 minutes',
                           idle_expires_at = now() + interval '1 hour'`,
    );
    await owner.get('/auth/me').expect(200);

    let { rows } = await ctx.pool.query(
      "SELECT idle_expires_at > now() + interval '7 hours' AS slid, idle_expires_at <= absolute_expires_at AS capped FROM sessions",
    );
    expect(rows[0]).toEqual({ slid: true, capped: true });

    await ctx.pool.query(
      `UPDATE sessions SET last_activity_at = now() - interval '5 minutes',
                           absolute_expires_at = now() + interval '30 minutes'`,
    );
    await owner.get('/auth/me').expect(200);
    ({ rows } = await ctx.pool.query(
      'SELECT idle_expires_at <= absolute_expires_at AS capped FROM sessions',
    ));
    expect(rows[0].capped).toBe(true);
  });
});

describe('garage settings', () => {
  it('reads the garage with an ETag and updates it under If-Match', async () => {
    const owner = await login(ctx.app);

    const read = await owner.get('/garage').expect(200);
    expect(read.headers.etag).toBe('"v1"');
    expect(read.body.data).toMatchObject({ name: 'Northside Garage', time_zone: 'UTC', version: 1 });

    expectError(await owner.patch('/garage', { name: 'Missing Header' }), 428, 'PRECONDITION_REQUIRED');

    const updated = await owner.patch('/garage', { name: 'Updated Garage', time_zone: 'Africa/Nairobi' }, 1).expect(200);
    expect(updated.body.data).toMatchObject({ name: 'Updated Garage', time_zone: 'Africa/Nairobi', version: 2 });
    expect(updated.headers.etag).toBe('"v2"');

    expectError(await owner.patch('/garage', { name: 'Stale' }, 1), 412, 'PRECONDITION_FAILED');
  });

  it('validates garage changes', async () => {
    const owner = await login(ctx.app);

    const badZone = await owner.patch('/garage', { time_zone: 'Mars/Olympus' }, 1);
    expectError(badZone, 422, 'VALIDATION_ERROR');
    expect(badZone.body.error.details[0]).toMatchObject({ field: 'time_zone' });

    expectError(await owner.patch('/garage', {}, 1), 422, 'VALIDATION_ERROR');
    expectError(await owner.patch('/garage', { name: '   ' }, 1), 422, 'VALIDATION_ERROR');
    expectError(await owner.patch('/garage', { name: 'x', extra: true }, 1), 422, 'VALIDATION_ERROR');

    const unchanged = await owner.get('/garage').expect(200);
    expect(unchanged.body.data.version).toBe(1);
  });
});
