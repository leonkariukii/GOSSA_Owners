import { ApiError } from './api.js';

export const STALE_MESSAGE =
  'This record was changed elsewhere — latest version loaded, please review and try again.';
export const NETWORK_MESSAGE =
  'Could not reach the GOSSA server. Check your connection and try again.';

const CODE_MESSAGES = {
  MECHANIC_OCCUPIED: 'That mechanic is already working on another in-progress job.',
  MECHANIC_UNAVAILABLE: 'That mechanic is off duty and cannot be assigned or started on a job.',
  MECHANIC_HAS_ACTIVE_JOB:
    'That mechanic is working on an in-progress job. Finish or reassign the job first.',
  MECHANIC_HAS_NONTERMINAL_JOBS:
    'That mechanic still has open, in-progress or waiting jobs. Reassign or close them before archiving.',
  ACTIVE_JOB_CANNOT_BE_UNASSIGNED:
    'An in-progress job cannot be left without a mechanic. Reassign it to another mechanic instead.',
  DUPLICATE_ACTIVE_VEHICLE_JOB:
    'Another active job already exists for this vehicle registration.',
  INVALID_STATUS_TRANSITION: 'That status change is not allowed from the job’s current status.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  CSRF_FAILED: 'Your session security token was out of date. It has been refreshed — please try again.',
};

export function isStale(error) {
  return error instanceof ApiError && error.status === 412;
}

export function errorMessage(error) {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.isNetwork) return NETWORK_MESSAGE;
  if (error.status === 412) return STALE_MESSAGE;
  if (CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code];
  if (error.status === 429) return CODE_MESSAGES.RATE_LIMITED;
  if (error.status === 422) {
    return error.details.length > 0
      ? 'Please correct the highlighted problems and try again.'
      : error.message;
  }
  if (error.status >= 500) return 'The server had a problem. Please try again shortly.';
  return error.message || 'Something went wrong. Please try again.';
}

export function loginErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Incorrect email or password.';
    if (error.status === 429 || error.code === 'RATE_LIMITED') return CODE_MESSAGES.RATE_LIMITED;
  }
  return errorMessage(error);
}

/** { field: message } from error.details (first message wins). */
export function fieldErrors(error) {
  const out = {};
  if (error instanceof ApiError) {
    for (const detail of error.details) {
      if (detail?.field && !(detail.field in out)) out[detail.field] = detail.message;
    }
  }
  return out;
}
