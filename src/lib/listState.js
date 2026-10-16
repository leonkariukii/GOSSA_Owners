import { DEFAULT_PAGE_SIZE, JOB_SORTS, JOB_STATUSES, DUTY_STATUSES, MECHANIC_SORTS } from './constants.js';

function toInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^\d+$/.test(value ?? '')) return fallback;
  const n = Number(value);
  return n >= min && n <= max ? n : fallback;
}

const text = (value, max = 120) => (value ?? '').trim().slice(0, max);
const oneOf = (value, allowed, fallback = '') => (allowed.includes(value) ? value : fallback);
const date = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : '');

function common(query, defaults) {
  return {
    page: toInt(query.page, 1),
    page_size: toInt(query.page_size, DEFAULT_PAGE_SIZE, { max: 100 }),
    sort_by: oneOf(query.sort_by, defaults.sorts, defaults.sort_by),
    order: oneOf(query.order, ['asc', 'desc'], defaults.order),
  };
}

export const JOB_DEFAULTS = {
  sorts: JOB_SORTS.map((s) => s.value),
  sort_by: 'created_at',
  order: 'desc',
};

export const MECHANIC_DEFAULTS = {
  sorts: MECHANIC_SORTS.map((s) => s.value),
  sort_by: 'name',
  order: 'asc',
};

export function readJobListState(query) {
  return {
    ...common(query, JOB_DEFAULTS),
    q: text(query.q),
    status: oneOf(query.status, JOB_STATUSES),
    mechanic_id: text(query.mechanic_id, 100),
    include_archived: query.include_archived === 'true',
    created_from: date(query.created_from),
    created_to: date(query.created_to),
  };
}

export function readMechanicListState(query) {
  return {
    ...common(query, MECHANIC_DEFAULTS),
    q: text(query.q),
    duty_status: oneOf(query.duty_status, DUTY_STATUSES),
    include_archived: query.include_archived === 'true',
  };
}

/** Documented API params only; empty values are omitted. */
export function toApiParams(state) {
  const params = {};
  for (const [key, value] of Object.entries(state)) {
    if (value === '' || value === false || value === null || value === undefined) continue;
    params[key] = value === true ? 'true' : value;
  }
  return params;
}

/** Hash query for the URL: omit values equal to the defaults. */
export function toHashQuery(state, defaults) {
  const out = {};
  for (const [key, value] of Object.entries(state)) {
    if (value === '' || value === false) continue;
    if (key === 'page' && value === 1) continue;
    if (key === 'page_size' && value === DEFAULT_PAGE_SIZE) continue;
    if (key === 'sort_by' && value === defaults.sort_by) continue;
    if (key === 'order' && value === defaults.order) continue;
    out[key] = value === true ? 'true' : String(value);
  }
  return out;
}
