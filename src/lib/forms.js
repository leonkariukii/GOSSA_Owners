// Field definitions and pure helpers shared by the record forms.

const f = (name, label, extra = {}) => ({ name, label, kind: 'text', ...extra });

export const JOB_CREATE_FIELDS = [
  f('customer_name', 'Customer name', { required: true, max: 160 }),
  f('customer_phone', 'Customer phone', { max: 32, inputType: 'tel' }),
  f('vehicle_registration', 'Vehicle registration', { required: true, max: 32 }),
  f('vehicle_make', 'Vehicle make', { max: 80 }),
  f('vehicle_model', 'Vehicle model', { max: 80 }),
  f('vehicle_year', 'Vehicle year', { kind: 'int', digits: 4 }),
  f('odometer_km', 'Odometer (km)', { kind: 'int' }),
  f('work_requested', 'Work requested', { required: true, max: 4000, multiline: true, wide: true }),
  f('internal_notes', 'Internal notes', { max: 4000, multiline: true, wide: true }),
];

export const JOB_EDIT_FIELDS = [
  ...JOB_CREATE_FIELDS.slice(0, 8),
  f('diagnosis', 'Diagnosis', { max: 4000, multiline: true, wide: true }),
  f('work_performed', 'Work performed', { max: 4000, multiline: true, wide: true }),
  JOB_CREATE_FIELDS[8],
];

export const MECHANIC_FIELDS = [
  f('name', 'Name', { required: true, max: 120 }),
  f('phone', 'Phone', { max: 32, inputType: 'tel' }),
  f('skills', 'Skills', { max: 500, multiline: true, wide: true }),
];

export const GARAGE_FIELDS = [
  f('name', 'Garage name', { required: true, max: 120 }),
  f('time_zone', 'Time zone (IANA name, e.g. Africa/Nairobi)', { required: true, max: 64 }),
];

export function emptyValues(fields) {
  return Object.fromEntries(fields.map((field) => [field.name, '']));
}

export function recordToValues(record, fields) {
  return Object.fromEntries(
    fields.map((field) => [field.name, record?.[field.name] == null ? '' : String(record[field.name])]),
  );
}

export function validateValues(values, fields) {
  const errors = {};
  for (const field of fields) {
    const raw = (values[field.name] ?? '').trim();
    if (!raw) {
      if (field.required) errors[field.name] = `${field.label.split(' (')[0]} is required.`;
    } else if (field.kind === 'int') {
      const pattern = field.digits ? new RegExp(`^\\d{${field.digits}}$`) : /^\d+$/;
      if (!pattern.test(raw)) {
        errors[field.name] = field.digits
          ? `Enter a ${field.digits}-digit year.`
          : 'Enter a whole number, 0 or more.';
      }
    } else if (field.max && raw.length > field.max) {
      errors[field.name] = `Must be ${field.max} characters or fewer.`;
    }
  }
  return errors;
}

/** Normalized JSON value for a raw input string: null, string, or number. */
export function normalizeValue(field, raw) {
  const value = (raw ?? '').trim();
  if (!value) return null;
  return field.kind === 'int' ? Number(value) : value;
}

export function createPayload(values, fields) {
  return Object.fromEntries(fields.map((field) => [field.name, normalizeValue(field, values[field.name])]));
}

/** Only fields whose normalized value differs from the baseline. */
export function diffPayload(values, baseline, fields) {
  const changes = {};
  for (const field of fields) {
    const next = normalizeValue(field, values[field.name]);
    const prev = normalizeValue(field, baseline[field.name]);
    if (next !== prev) changes[field.name] = next;
  }
  return changes;
}
