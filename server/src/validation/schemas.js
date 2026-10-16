import { z } from 'zod';
import { normalizeRegistration } from '../domain/registration.js';
import { JOB_STATUSES } from '../domain/transitions.js';
import { validationError, zodDetails } from '../errors.js';

/** Parse `value` with `schema` or throw a 422 VALIDATION_ERROR with safe field details. */
export function parse(schema, value) {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    throw validationError(zodDetails(result.error));
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const blankToNull = (value) => (value === '' ? null : value);
const requiredText = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) => z.string().trim().max(max).transform(blankToNull).nullable().optional();

function isPermissivePhone(value) {
  if (value === '') {
    return true;
  }
  if (!/^\+?[\d\s().-]+$/.test(value)) {
    return false;
  }
  const digits = value.replace(/\D/g, '').length;
  return digits >= 3 && digits <= 20;
}

const phone = () =>
  z.string().trim().max(32).refine(isPermissivePhone, 'Must be a valid phone number.').transform(blankToNull).nullable().optional();

const atLeastOne = [(value) => Object.keys(value).length > 0, { message: 'At least one field is required.' }];

// ---------------------------------------------------------------------------
// Authentication and garage
// ---------------------------------------------------------------------------

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254).regex(EMAIL_PATTERN),
  password: z.string().min(12).max(128),
});

export const garagePatchBody = z
  .object({
    name: requiredText(120).optional(),
    time_zone: requiredText(64).optional(),
  })
  .strict()
  .refine(...atLeastOne);

// ---------------------------------------------------------------------------
// Mechanics
// ---------------------------------------------------------------------------

export const mechanicCreateBody = z
  .object({
    name: requiredText(120),
    phone: phone(),
    skills: optionalText(500),
  })
  .strict();

export const mechanicPatchBody = z
  .object({
    name: requiredText(120).optional(),
    phone: phone(),
    skills: optionalText(500),
  })
  .strict()
  .refine(...atLeastOne);

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

const vehicleYear = z
  .number()
  .int()
  .min(1886)
  .refine((value) => value <= new Date().getUTCFullYear() + 1, 'Must be no later than next year.')
  .nullable()
  .optional();

const odometerKm = z.number().int().min(0).max(2_147_483_647).nullable().optional();

const registration = requiredText(32).refine(
  (value) => normalizeRegistration(value) !== '',
  'Must contain letters or digits.',
);

export const jobCreateBody = z
  .object({
    customer_name: requiredText(160),
    customer_phone: phone(),
    vehicle_registration: registration,
    vehicle_make: optionalText(80),
    vehicle_model: optionalText(80),
    vehicle_year: vehicleYear,
    odometer_km: odometerKm,
    work_requested: requiredText(4000),
    internal_notes: optionalText(4000),
  })
  .strict();

export const jobPatchBody = z
  .object({
    customer_name: requiredText(160).optional(),
    customer_phone: phone(),
    vehicle_registration: registration.optional(),
    vehicle_make: optionalText(80),
    vehicle_model: optionalText(80),
    vehicle_year: vehicleYear,
    odometer_km: odometerKm,
    work_requested: requiredText(4000).optional(),
    diagnosis: optionalText(4000),
    work_performed: optionalText(4000),
    internal_notes: optionalText(4000),
  })
  .strict()
  .refine(...atLeastOne);

export const assignmentBody = z
  .object({
    mechanic_id: z.string().trim().min(1).max(64).nullable(),
  })
  .strict();

export const transitionBody = z
  .object({
    to_status: z.enum(JOB_STATUSES),
    note: optionalText(500),
  })
  .strict();

// ---------------------------------------------------------------------------
// Query strings (strict: unknown parameters are rejected)
// ---------------------------------------------------------------------------

const page = z.coerce.number().int().min(1).max(1_000_000).optional();
const pageSize = z.coerce.number().int().min(1).max(100).optional();
const order = z.enum(['asc', 'desc']).optional();
const booleanText = z.enum(['true', 'false']).optional();
const searchText = z.string().trim().min(1).max(120).optional();

function isRealDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format.')
  .refine(isRealDate, 'Must be a real calendar date.');

export const emptyQuery = z.object({}).strict();

export const mechanicListQuery = z
  .object({
    page,
    page_size: pageSize,
    sort_by: z.enum(['name', 'created_at', 'updated_at']).optional(),
    order,
    q: searchText,
    duty_status: z.enum(['available', 'busy', 'off_duty']).optional(),
    include_archived: booleanText,
  })
  .strict();

export const jobListQuery = z
  .object({
    page,
    page_size: pageSize,
    sort_by: z.enum(['job_number', 'status', 'created_at', 'updated_at']).optional(),
    order,
    q: searchText,
    status: z.enum(JOB_STATUSES).optional(),
    mechanic_id: z.string().trim().min(1).max(64).optional(),
    include_archived: booleanText,
    created_from: dateOnly.optional(),
    created_to: dateOnly.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.created_from || !value.created_to) {
      return;
    }
    const from = Date.parse(`${value.created_from}T00:00:00Z`);
    const to = Date.parse(`${value.created_to}T00:00:00Z`);
    if (Number.isNaN(from) || Number.isNaN(to)) {
      return;
    }
    if (from > to) {
      ctx.addIssue({ code: 'custom', path: ['created_from'], message: 'Must not be later than created_to.' });
    } else if ((to - from) / 86_400_000 + 1 > 366) {
      ctx.addIssue({ code: 'custom', path: ['created_to'], message: 'The date range must not exceed 366 days.' });
    }
  });

export const historyQuery = z
  .object({
    page,
    page_size: pageSize,
    sort_by: z.enum(['created_at']).optional(),
    order: z.enum(['desc']).optional(),
  })
  .strict();
