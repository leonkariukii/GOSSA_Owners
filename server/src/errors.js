export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = 'The request is malformed.') => new AppError(400, 'BAD_REQUEST', message);
export const unauthenticated = (message = 'Authentication required.') => new AppError(401, 'UNAUTHENTICATED', message);
export const csrfFailed = () => new AppError(403, 'CSRF_FAILED', 'Missing or invalid CSRF token.');
export const notFound = (message = 'Resource not found.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code, message) => new AppError(409, code, message);
export const preconditionFailed = (message = 'The record was changed by someone else. Reload and try again.') =>
  new AppError(412, 'PRECONDITION_FAILED', message);
export const preconditionRequired = () =>
  new AppError(428, 'PRECONDITION_REQUIRED', 'The If-Match header is required for this request.');
export const rateLimited = () => new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.');
export const validationError = (details, message = 'One or more fields are invalid.') =>
  new AppError(422, 'VALIDATION_ERROR', message, details);

/** Convert a zod error into the safe `details` array of the API error contract. */
export function zodDetails(error) {
  const details = [];

  for (const issue of error.issues) {
    const base = issue.path.map(String).join('.');

    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys ?? []) {
        details.push({ field: base ? `${base}.${key}` : key, code: 'unknown_field', message: 'Is not an allowed field.' });
      }
      continue;
    }

    details.push({ field: base || 'request', ...describeIssue(issue) });
  }

  return details;
}

function describeIssue(issue) {
  const kind = issue.origin ?? issue.type;
  const hasCustomMessage = typeof issue.message === 'string' && !/^Invalid/.test(issue.message);

  switch (issue.code) {
    case 'too_big':
      return kind === 'string'
        ? { code: 'too_long', message: `Must be ${issue.maximum} characters or fewer.` }
        : { code: 'too_large', message: `Must be at most ${issue.maximum}.` };
    case 'too_small':
      if (kind === 'string') {
        return Number(issue.minimum) <= 1
          ? { code: 'required', message: 'Is required.' }
          : { code: 'too_short', message: `Must be at least ${issue.minimum} characters.` };
      }
      return { code: 'too_small', message: `Must be at least ${issue.minimum}.` };
    case 'invalid_type':
      return issue.received === 'undefined' || /received undefined/.test(issue.message ?? '')
        ? { code: 'required', message: 'Is required.' }
        : { code: 'invalid_type', message: 'Has the wrong type.' };
    case 'invalid_value':
    case 'invalid_enum_value':
      return { code: 'invalid_value', message: 'Is not an allowed value.' };
    case 'invalid_format':
    case 'invalid_string':
    case 'custom':
      return { code: 'invalid', message: hasCustomMessage ? issue.message : 'Has an invalid format.' };
    default:
      return { code: 'invalid', message: hasCustomMessage ? issue.message : 'Is invalid.' };
  }
}
