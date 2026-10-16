import crypto from 'node:crypto';
import { csrfFailed, unauthenticated } from '../errors.js';
import { findActiveSession, touchSession } from '../repos/sessions.js';

export const SESSION_COOKIE = 'session_id';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ACTIVITY_REFRESH_MS = 60_000;

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) {
      continue;
    }
    const name = part.slice(0, index).trim();
    if (!name || name in cookies) {
      continue;
    }
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // Ignore cookies with invalid encoding.
    }
  }
  return cookies;
}

export function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    path: '/',
  };
}

/**
 * Resolve the owner session from the cookie. Sets `req.auth` with the tenant
 * (`garageId`) derived from the authenticated owner — never from client input.
 */
export function authenticate({ pool }) {
  return async (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) {
      throw unauthenticated();
    }

    const row = await findActiveSession(pool, hashToken(token));
    if (!row) {
      throw unauthenticated();
    }

    if (Date.now() - new Date(row.last_activity_at).getTime() > ACTIVITY_REFRESH_MS) {
      await touchSession(pool, row.session_id);
    }

    req.auth = {
      session: { id: row.session_id, csrfToken: row.csrf_token },
      user: { id: row.user_id, name: row.user_name, email: row.email, role: 'owner' },
      garageId: row.garage_id,
      garage: { id: row.garage_id, name: row.garage_name, timeZone: row.time_zone, version: row.garage_version },
    };
    next();
  };
}

/** Require the session-bound CSRF token on every state-changing request. */
export function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const provided = req.get('x-csrf-token');
  if (!provided) {
    throw csrfFailed();
  }

  const digest = (value) => crypto.createHash('sha256').update(value).digest();
  if (!crypto.timingSafeEqual(digest(provided), digest(req.auth.session.csrfToken))) {
    throw csrfFailed();
  }
  next();
}
