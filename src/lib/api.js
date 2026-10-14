import axios from 'axios';

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor({ status, code, message, details = [], requestId = null, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = token ?? null;
}

export function getCsrfToken() {
  return csrfToken;
}

export function toApiError(error) {
  const response = error?.response;
  if (response) {
    const body = response.data?.error;
    return new ApiError({
      status: response.status ?? body?.status ?? 500,
      code: body?.code ?? 'UNKNOWN_ERROR',
      message: body?.message ?? 'The request could not be completed.',
      details: Array.isArray(body?.details) ? body.details : [],
      requestId: body?.request_id ?? null,
      cause: error,
    });
  }
  return new ApiError({
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'Could not reach the GOSSA server.',
    cause: error,
  });
}

export function cleanParams(params = {}) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

/**
 * Perform an API request. `version` (a record's integer version) becomes
 * `If-Match: "v<version>"`. Returns the parsed JSON body (null for 204).
 */
export async function request(method, path, { params, body, version } = {}) {
  const verb = method.toUpperCase();
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (verb !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (version !== undefined && version !== null) headers['If-Match'] = `"v${version}"`;

  let response;
  try {
    response = await axios.request({
      method: verb,
      url: `${API_BASE}${path}`,
      params: params ? cleanParams(params) : undefined,
      data: body,
      headers,
    });
  } catch (error) {
    throw toApiError(error);
  }
  if (response.status === 204) return null;
  return response.data;
}
