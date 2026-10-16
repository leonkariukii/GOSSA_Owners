import crypto from 'node:crypto';
import { AppError, badRequest, conflict, notFound } from '../errors.js';

/** Assign a request id, expose it as X-Request-Id, and log one line per request. */
export function requestContext(logger) {
  return (req, res, next) => {
    const requestId = `req_${crypto.randomBytes(9).toString('base64url')}`;
    const path = req.originalUrl.split('?')[0];
    const started = process.hrtime.bigint();

    req.requestId = requestId;
    res.set('X-Request-Id', requestId);
    res.on('finish', () => {
      logger.info('request', {
        request_id: requestId,
        method: req.method,
        path,
        status: res.statusCode,
        duration_ms: Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100,
      });
    });
    next();
  };
}

export function securityHeaders(config) {
  return (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    if (config.NODE_ENV === 'production') {
      res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  };
}

export function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

export function notFoundHandler(req, res, next) {
  next(notFound('Resource not found.'));
}

const DB_CONSTRAINT_ERRORS = {
  uq_jobs_active_vehicle: () =>
    conflict('DUPLICATE_ACTIVE_VEHICLE_JOB', 'Another active job already uses this vehicle registration.'),
  uq_jobs_one_in_progress_per_mechanic: () =>
    conflict('MECHANIC_OCCUPIED', 'This mechanic is already assigned to an active job.'),
};

function toAppError(error) {
  if (error instanceof AppError) {
    return error;
  }

  // body-parser errors
  if (error?.type === 'entity.parse.failed') {
    return badRequest('The request body is not valid JSON.');
  }
  if (error?.type === 'entity.too.large') {
    return badRequest('The request body is too large.');
  }
  if (typeof error?.type === 'string' && /^(charset|encoding|request)\./.test(error.type)) {
    return badRequest('The request body could not be read.');
  }

  // PostgreSQL constraint and concurrency errors that map to documented conflicts
  if (error?.code === '23505' && DB_CONSTRAINT_ERRORS[error.constraint]) {
    return DB_CONSTRAINT_ERRORS[error.constraint]();
  }
  if (error?.code === '40001' || error?.code === '40P01') {
    return conflict('CONFLICT', 'The request conflicted with another change. Please retry.');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

export function errorHandler(logger) {
  // Express identifies error middleware by its four-argument signature.
  return (error, req, res, _next) => {
    const appError = toAppError(error);

    if (appError.status >= 500) {
      logger.error('Unhandled request error', {
        request_id: req.requestId,
        error: error?.message,
        stack: error?.stack,
      });
    }

    if (res.headersSent) {
      return;
    }

    const body = {
      code: appError.code,
      message: appError.message,
      status: appError.status,
      timestamp: new Date().toISOString(),
      request_id: req.requestId,
    };
    if (appError.details?.length) {
      body.details = appError.details;
    }

    res.status(appError.status).json({ error: body });
  };
}
