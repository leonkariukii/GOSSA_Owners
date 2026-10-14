import crypto from 'node:crypto';
import express from 'express';
import argon2 from 'argon2';
import { rateLimited, unauthenticated } from '../errors.js';
import { findOwnerByEmail } from '../repos/owners.js';
import { deleteStaleSessions, insertSession, revokeSession } from '../repos/sessions.js';
import { SESSION_COOKIE, hashToken, randomToken, sessionCookieOptions } from '../http/auth.js';
import { loginBody } from '../validation/schemas.js';

let dummyHash;

/** Verify against a throwaway hash when the account is unknown so timing does not reveal it. */
async function verifyPassword(hash, password) {
  try {
    if (!hash) {
      dummyHash ??= await argon2.hash('dummy-password-for-timing', { type: argon2.argon2id });
      await argon2.verify(dummyHash, password);
      return false;
    }
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function sessionPayload({ user, garage, csrfToken }) {
  return {
    user: { id: user.id, email: user.email, name: user.name, role: 'owner' },
    garage: { id: garage.id, name: garage.name, time_zone: garage.time_zone },
    csrf_token: csrfToken,
  };
}

/** Routes that must work without a session. */
export function createPublicAuthRouter({ pool, config, limiter }) {
  const router = express.Router();

  router.post('/auth/login', async (req, res) => {
    const key = req.ip ?? 'unknown';
    if (limiter.isLimited(key)) {
      throw rateLimited();
    }

    const parsed = loginBody.safeParse(req.body ?? {});
    let owner = null;
    let verified = false;
    if (parsed.success) {
      owner = await findOwnerByEmail(pool, parsed.data.email);
      verified = await verifyPassword(owner?.password_hash, parsed.data.password);
    }

    if (!owner || !verified) {
      limiter.recordFailure(key);
      throw unauthenticated('Invalid email or password.');
    }
    limiter.reset(key);

    // A fresh session ID and CSRF token are generated on every successful login.
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    await insertSession(pool, {
      id: `sess_${crypto.randomUUID()}`,
      sessionIdHash: hashToken(sessionToken),
      ownerUserId: owner.id,
      csrfToken,
    });
    deleteStaleSessions(pool).catch(() => {});

    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions(config));
    res.json({
      data: sessionPayload({
        user: owner,
        garage: { id: owner.garage_id, name: owner.garage_name, time_zone: owner.time_zone },
        csrfToken,
      }),
    });
  });

  return router;
}

/** Routes that require a session (CSRF is enforced upstream for non-GET requests). */
export function createSessionRouter({ pool, config }) {
  const router = express.Router();

  router.post('/auth/logout', async (req, res) => {
    await revokeSession(pool, req.auth.session.id);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(config));
    res.status(204).end();
  });

  router.get('/auth/me', (req, res) => {
    const { user, garage, session } = req.auth;
    res.json({
      data: sessionPayload({
        user,
        garage: { id: garage.id, name: garage.name, time_zone: garage.timeZone },
        csrfToken: session.csrfToken,
      }),
    });
  });

  return router;
}
