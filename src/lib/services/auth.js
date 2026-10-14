import { ApiError, request, setCsrfToken } from '../api.js';

export const sessionKey = ['session'];

/** Resolves to the session, or null when signed out (401). */
export async function me() {
  try {
    const payload = await request('GET', '/auth/me');
    setCsrfToken(payload.data.csrf_token);
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw error;
  }
}

export async function login({ email, password }) {
  const payload = await request('POST', '/auth/login', { body: { email, password } });
  setCsrfToken(payload.data.csrf_token);
  return payload.data;
}

export async function logout() {
  await request('POST', '/auth/logout');
  setCsrfToken(null);
}
