import { describe, expect, it } from 'vitest';
import { ApiError } from './api.js';
import { TRANSITIONS } from './constants.js';
import { errorMessage, fieldErrors, isStale } from './errors.js';
import { diffPayload, createPayload, JOB_CREATE_FIELDS, validateValues } from './forms.js';
import { readJobListState, toApiParams, toHashQuery, JOB_DEFAULTS } from './listState.js';
import { buildHash, matchRoute, parseHash } from './router.js';

describe('router', () => {
  it('parses and rebuilds hash locations', () => {
    expect(parseHash('#/jobs?status=open&page=2')).toEqual({ path: '/jobs', query: { status: 'open', page: '2' } });
    expect(parseHash('')).toEqual({ path: '/', query: {} });
    expect(buildHash('/jobs', { status: 'open', q: '', page: undefined })).toBe('#/jobs?status=open');
  });

  it('matches routes and rejects unknown paths', () => {
    expect(matchRoute('/').name).toBe('dashboard');
    expect(matchRoute('/jobs/new').name).toBe('job-new');
    expect(matchRoute('/jobs/abc')).toEqual({ name: 'job', params: { id: 'abc' } });
    expect(matchRoute('/mechanics/m%201').params.id).toBe('m 1');
    expect(matchRoute('/jobs/a/b').name).toBe('not-found');
    expect(matchRoute('/nope').name).toBe('not-found');
    expect(matchRoute('/jobs/%E0%A4%A').name).toBe('not-found');
  });
});

describe('list state', () => {
  it('falls back to safe defaults for invalid URL values', () => {
    const state = readJobListState({ status: 'bogus', page: '-3', page_size: '999', sort_by: 'x', order: 'up' });
    expect(state).toMatchObject({ status: '', page: 1, page_size: 25, sort_by: 'created_at', order: 'desc' });
  });

  it('only sends documented, non-empty API params and omits defaults from the URL', () => {
    const state = readJobListState({ status: 'open', q: ' kda ', include_archived: 'true' });
    expect(toApiParams(state)).toMatchObject({ status: 'open', q: 'kda', include_archived: 'true', page: 1 });
    expect(toHashQuery(state, JOB_DEFAULTS)).toEqual({ status: 'open', q: 'kda', include_archived: 'true' });
  });
});

describe('forms', () => {
  it('validates required fields and numbers', () => {
    const values = { customer_name: ' ', vehicle_registration: 'KDA', work_requested: 'x', vehicle_year: '20x', odometer_km: '-1' };
    const errors = validateValues(values, JOB_CREATE_FIELDS);
    expect(Object.keys(errors).sort()).toEqual(['customer_name', 'odometer_km', 'vehicle_year']);
  });

  it('builds create payloads with null for blanks and numbers for integers', () => {
    const values = {
      customer_name: ' Sam ', customer_phone: '', vehicle_registration: 'KDA 1A', vehicle_make: '', vehicle_model: '',
      vehicle_year: '2020', odometer_km: '', work_requested: 'Brakes', internal_notes: '',
    };
    expect(createPayload(values, JOB_CREATE_FIELDS)).toMatchObject({
      customer_name: 'Sam', customer_phone: null, vehicle_year: 2020, odometer_km: null,
    });
  });

  it('diffs only changed fields so untouched fields are not overwritten', () => {
    const base = { customer_name: 'Sam', customer_phone: '', vehicle_year: '2020' };
    const values = { customer_name: 'Sam', customer_phone: '0700000000', vehicle_year: '' };
    const fields = JOB_CREATE_FIELDS.filter((f) => f.name in base);
    expect(diffPayload(values, base, fields)).toEqual({ customer_phone: '0700000000', vehicle_year: null });
  });
});

describe('errors and lifecycle', () => {
  it('maps API errors to safe, readable messages', () => {
    const stale = new ApiError({ status: 412, code: 'PRECONDITION_FAILED', message: 'x' });
    expect(isStale(stale)).toBe(true);
    expect(errorMessage(stale)).toMatch(/changed elsewhere/);
    expect(errorMessage(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'x' }))).toMatch(/Could not reach/);
    expect(errorMessage(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'stack trace' }))).not.toMatch(/stack/);
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });

  it('exposes the first message per field', () => {
    const error = new ApiError({
      status: 422, code: 'VALIDATION_ERROR', message: 'x',
      details: [{ field: 'name', message: 'First' }, { field: 'name', message: 'Second' }, { message: 'No field' }],
    });
    expect(fieldErrors(error)).toEqual({ name: 'First' });
  });

  it('mirrors the documented status transitions', () => {
    expect(TRANSITIONS).toEqual({
      open: ['in_progress', 'cancelled'],
      in_progress: ['waiting', 'completed', 'cancelled'],
      waiting: ['in_progress', 'cancelled'],
      completed: [],
      cancelled: [],
    });
  });
});
